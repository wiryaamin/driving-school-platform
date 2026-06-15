import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Save, Info } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  useChannelConfigs,
  useUpdateChannelConfig,
  type CommChannel,
  type ChannelConfig,
} from '../hooks/useCommunication.js';
import { CHANNEL_META } from '../components/ChannelIcon.js';

// ─── Provider options per channel ─────────────────────────────────────────────

const PROVIDER_OPTIONS: Record<CommChannel, Array<{ value: string; label: string }>> = {
  sms:      [{ value: '46elks',   label: '46elks (Sverige)' }, { value: 'twilio', label: 'Twilio' }, { value: 'vonage', label: 'Vonage' }],
  email:    [{ value: 'resend',   label: 'Resend' },           { value: 'sendgrid', label: 'SendGrid' }, { value: 'mailjet', label: 'Mailjet' }],
  whatsapp: [{ value: 'twilio',   label: 'Twilio WhatsApp' },  { value: 'meta', label: 'Meta Cloud API' }],
  push:     [{ value: 'firebase', label: 'Firebase (FCM)' },   { value: 'onesignal', label: 'OneSignal' }],
  voice:    [{ value: 'twilio',   label: 'Twilio Voice' },     { value: '46elks', label: '46elks Röst' }],
};

const ENV_HINTS: Record<string, string[]> = {
  '46elks':    ['ELKS_API_USERNAME', 'ELKS_API_PASSWORD'],
  'resend':    ['RESEND_API_KEY'],
  'twilio':    ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
  'sendgrid':  ['SENDGRID_API_KEY'],
  'mailjet':   ['MAILJET_API_KEY', 'MAILJET_SECRET_KEY'],
  'vonage':    ['VONAGE_API_KEY', 'VONAGE_API_SECRET'],
  'firebase':  ['FIREBASE_SERVER_KEY'],
  'onesignal': ['ONESIGNAL_APP_ID', 'ONESIGNAL_API_KEY'],
  'meta':      ['META_WHATSAPP_TOKEN', 'META_PHONE_NUMBER_ID'],
};

const CHANNEL_ORDER: CommChannel[] = ['sms', 'email', 'whatsapp', 'push', 'voice'];

// ─── ChannelForm ──────────────────────────────────────────────────────────────

function ChannelForm({
  channel,
  config,
}: {
  channel: CommChannel;
  config:  ChannelConfig | null;
}) {
  const update = useUpdateChannelConfig();
  const meta   = CHANNEL_META[channel];
  const opts   = PROVIDER_OPTIONS[channel];

  const [enabled,     setEnabled]     = useState(config?.enabled     ?? false);
  const [provider,    setProvider]    = useState(config?.provider     ?? '');
  const [fromAddress, setFromAddress] = useState(config?.from_address ?? '');
  const [displayName, setDisplayName] = useState(config?.display_name ?? '');
  const [dailyLimit,  setDailyLimit]  = useState(String(config?.daily_limit ?? 500));

  // Sync when config loads
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setProvider(config.provider ?? '');
      setFromAddress(config.from_address ?? '');
      setDisplayName(config.display_name ?? '');
      setDailyLimit(String(config.daily_limit));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.id]);

  const hints = provider ? (ENV_HINTS[provider] ?? []) : [];
  const isDirty = !config
    || config.enabled       !== enabled
    || (config.provider     ?? '') !== provider
    || (config.from_address ?? '') !== fromAddress
    || (config.display_name ?? '') !== displayName
    || String(config.daily_limit)  !== dailyLimit;

  function handleSave() {
    update.mutate(
      {
        channel,
        enabled,
        provider:     provider     || null,
        from_address: fromAddress  || null,
        display_name: displayName  || null,
        daily_limit:  parseInt(dailyLimit, 10) || 500,
      },
      {
        onSuccess: () => toast({ title: `${meta.label} uppdaterat` }),
        onError:   (e) => toast({ title: 'Fel', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      },
    );
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card p-5 space-y-4 transition-opacity',
      !enabled && 'opacity-80',
    )}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', meta.bg)}>
          <meta.Icon className={cn('w-4 h-4', meta.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? (provider ? `Via ${provider}` : 'Aktiverad — välj leverantör') : 'Inaktiverad'}
          </p>
        </div>
        {/* Enabled toggle */}
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
            enabled ? 'bg-primary' : 'bg-muted',
          )}
          role="switch"
          aria-checked={enabled}
        >
          <span className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-0',
          )} />
        </button>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Leverantör</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full h-9 text-sm px-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">— Välj leverantör —</option>
            {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            {channel === 'email' ? 'Avsändaradress (e-post)' : channel === 'push' ? 'App-ID / Token' : 'Avsändarnummer / -namn'}
          </label>
          <input
            type={channel === 'email' ? 'email' : 'text'}
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder={channel === 'email' ? 'noreply@korskolan.se' : channel === 'sms' ? '+46701234567 eller Korskolan' : '—'}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Visningsnamn</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Stockholms Trafikskola"
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Daglig gräns (meddelanden)</label>
          <input
            type="number"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            min={1}
            max={10000}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Env hints */}
      {hints.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 rounded-lg px-3 py-2.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-0.5">Supabase Secrets krävs för {provider}:</p>
            <p className="font-mono">{hints.join('   ')}</p>
            <p className="mt-1 text-amber-600 dark:text-amber-500 text-[10px]">
              supabase secrets set {hints[0]}=value --project-ref {'<ref>'}
            </p>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={update.isPending || !isDirty}
          className={cn(!isDirty && 'opacity-40')}
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {update.isPending ? 'Sparar…' : 'Spara'}
        </Button>
      </div>
    </div>
  );
}

// ─── ChannelSettingsPage ──────────────────────────────────────────────────────

export function ChannelSettingsPage() {
  const { data: configs = [], isLoading } = useChannelConfigs();
  const configMap = Object.fromEntries(configs.map((c) => [c.channel, c]));

  return (
    <PageLayout>
      <PageHeader
        title="Kanalinställningar"
        description="Konfigurera varje meddelandekanal med leverantör och sändningsgränser"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Kanalinställningar' },
        ]}
      />

      <PageContent>
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 px-4 py-2.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            API-nycklar lagras som{' '}
            <a href="https://supabase.com/docs/guides/functions/secrets" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              Supabase Secrets
            </a>
            {' '}— aldrig i databasen. Välj leverantör, fyll i adress, och spara. Aktivera sedan kanalen med reglage.
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {CHANNEL_ORDER.map((ch) => (
              <div key={ch} className="h-52 rounded-xl border border-border bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {CHANNEL_ORDER.map((ch) => (
              <ChannelForm
                key={ch}
                channel={ch}
                config={configMap[ch] ?? null}
              />
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center pt-2">
          <Link to="/communication/rules" className="hover:text-foreground hover:underline">
            Konfigurera notisregler →
          </Link>
        </div>
      </PageContent>
    </PageLayout>
  );
}
