import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Save, Info, Loader2, CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { SubscriptionGate } from '@core/rbac/SubscriptionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import {
  useChannelConfigs,
  useUpdateChannelConfig,
  useSendMessage,
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
  'firebase':  ['FIREBASE_SERVICE_ACCOUNT_JSON'],
  'onesignal': ['ONESIGNAL_APP_ID', 'ONESIGNAL_API_KEY'],
  'meta':      ['META_WHATSAPP_TOKEN', 'META_PHONE_NUMBER_ID'],
};

// Channel+provider overrides for cases where secrets differ (e.g. Twilio SMS vs WhatsApp)
const CHANNEL_PROVIDER_HINTS: Partial<Record<CommChannel, Record<string, string[]>>> = {
  whatsapp: {
    twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER'],
  },
};

// Human-friendly labels for each credential field, shown above its input.
const FIELD_LABELS: Record<string, string> = {
  ELKS_API_USERNAME:             'Användarnamn (46elks)',
  ELKS_API_PASSWORD:             'Lösenord (46elks)',
  RESEND_API_KEY:                'API-nyckel (Resend)',
  TWILIO_ACCOUNT_SID:            'Account SID (Twilio)',
  TWILIO_AUTH_TOKEN:             'Auth Token (Twilio)',
  TWILIO_PHONE_NUMBER:           'Avsändarnummer (Twilio)',
  TWILIO_WHATSAPP_NUMBER:        'WhatsApp-avsändarnummer (Twilio)',
  SENDGRID_API_KEY:              'API-nyckel (SendGrid)',
  MAILJET_API_KEY:               'API-nyckel (Mailjet)',
  MAILJET_SECRET_KEY:            'Secret Key (Mailjet)',
  VONAGE_API_KEY:                'API Key (Vonage)',
  VONAGE_API_SECRET:             'API Secret (Vonage)',
  FIREBASE_SERVICE_ACCOUNT_JSON: 'Service Account JSON (Firebase)',
  ONESIGNAL_APP_ID:              'App ID (OneSignal)',
  ONESIGNAL_API_KEY:             'API-nyckel (OneSignal)',
  META_WHATSAPP_TOKEN:           'Åtkomsttoken (Meta)',
  META_PHONE_NUMBER_ID:          'Telefonnummer-ID (Meta)',
};

// Fields whose value should be masked while typing (genuine secrets) —
// identifiers like phone numbers/App IDs are shown in plain text.
function isSecretField(field: string): boolean {
  return /PASSWORD|TOKEN|KEY|SECRET|JSON/.test(field);
}

// GSM/SMS spec: a numeric sender ("+46701234567") can be up to 15 digits,
// but an alphanumeric sender name ("Din Trafikskola") is capped at 11
// characters — 46elks (and every other SMS gateway) rejects anything
// longer with a 403. Confirmed live 2026-08-06: a school's full name in
// this field failed every send with "Too long alphanumeric from number".
const SMS_ALPHA_SENDER_MAX = 11;
function isPhoneLikeSender(value: string): boolean {
  return /^\+?\d+$/.test(value.trim());
}

// Every transactional email API (Resend/SendGrid/Mailjet) only lets you
// send "from" a domain you've proven ownership of via DNS records added in
// *that provider account's own* dashboard — verification is scoped per
// account, not shared platform-wide. Two distinct failure modes, both
// confirmed live 2026-08-06:
//  1. A free-mail domain (gmail.com, etc.) can never be verified by
//     anyone but its owner (Google) — using one as a sender always fails,
//     regardless of whose provider account is sending.
//  2. trafikcloud.se is verified under the *platform's* Resend account.
//     Once a tenant enters their own API key, sends go through *their*
//     account instead — which has never verified trafikcloud.se — so the
//     exact same domain that worked before now fails.
const UNVERIFIABLE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me',
  'gmx.com', 'gmx.se', 'telia.com', 'bredband.net', 'comhem.se',
]);
const PLATFORM_DOMAIN = 'trafikcloud.se';
// Primary API-key credential field per email provider — presence (typed
// now, or already saved) means sends now go through the tenant's own
// account rather than the platform's.
const EMAIL_PRIMARY_KEY_FIELD: Record<string, string> = {
  resend:   'RESEND_API_KEY',
  sendgrid: 'SENDGRID_API_KEY',
  mailjet:  'MAILJET_API_KEY',
};
function emailSenderDomain(value: string): string | null {
  const at = value.trim().lastIndexOf('@');
  return at === -1 ? null : value.trim().slice(at + 1).toLowerCase();
}

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
  // All five channels are platform-managed (ADR: platform-managed
  // integrations) — provider selection and credential entry are hidden for
  // every one; enabled/sender/display-name/daily-limit remain
  // tenant-configurable exactly as before.
  const isSms      = channel === 'sms';
  const isEmail    = channel === 'email';
  const isWhatsapp = channel === 'whatsapp';
  const isPush     = channel === 'push';
  const isVoice    = channel === 'voice';
  const isPlatformManagedProvider = isSms || isEmail || isWhatsapp || isPush || isVoice;

  const [enabled,           setEnabled]           = useState(config?.enabled              ?? false);
  const [provider,          setProvider]          = useState(config?.provider               ?? '');
  const [fromAddress,       setFromAddress]       = useState(config?.from_address           ?? '');
  const [displayName,       setDisplayName]       = useState(config?.display_name           ?? '');
  const [dailyLimit,        setDailyLimit]        = useState(String(config?.daily_limit     ?? 500));
  const [testAddr,          setTestAddr]          = useState('');
  const [testResult,        setTestResult]        = useState<'idle' | 'ok' | 'error'>('idle');
  // Credential inputs always start blank — the real values are never sent
  // to the browser, only a masked display fragment (config.credentials_masked).
  const [credInputs, setCredInputs] = useState<Record<string, string>>({});
  const sendMsg = useSendMessage();

  // Sync when config loads
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setProvider(config.provider ?? '');
      setFromAddress(config.from_address ?? '');
      setDisplayName(config.display_name ?? '');
      setDailyLimit(String(config.daily_limit));
      setCredInputs({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.id]);

  const hints = provider ? (CHANNEL_PROVIDER_HINTS[channel]?.[provider] ?? ENV_HINTS[provider] ?? []) : [];
  const dirtyCredFields = Object.values(credInputs).some((v) => v.trim() !== '');
  const isDirty = !config
    || config.enabled              !== enabled
    || (config.provider            ?? '') !== provider
    || (config.from_address        ?? '') !== fromAddress
    || (config.display_name        ?? '') !== displayName
    || String(config.daily_limit)         !== dailyLimit
    || dirtyCredFields;
  const invalidEnabledWithoutProvider = !isPlatformManagedProvider && enabled && !provider;
  const senderTooLong = channel === 'sms'
    && fromAddress.trim() !== ''
    && !isPhoneLikeSender(fromAddress)
    && fromAddress.trim().length > SMS_ALPHA_SENDER_MAX;

  const emailKeyField  = channel === 'email' ? EMAIL_PRIMARY_KEY_FIELD[provider] : undefined;
  const hasOwnEmailKey = !!emailKeyField
    && ((credInputs[emailKeyField]?.trim() ?? '') !== '' || (config?.credentials_configured?.[emailKeyField] ?? false));
  const senderDomain = channel === 'email' ? emailSenderDomain(fromAddress) : null;
  const senderDomainInvalid = channel === 'email' && !!senderDomain && (
    UNVERIFIABLE_EMAIL_DOMAINS.has(senderDomain)
    || (hasOwnEmailKey && senderDomain === PLATFORM_DOMAIN)
  );

  function handleTest() {
    if (!testAddr.trim() || !enabled) return;
    setTestResult('idle');
    sendMsg.mutate(
      {
        channel,
        recipient_address: testAddr.trim(),
        body:              `Testmeddelande från ${displayName || 'Trafikskola'} — ${CHANNEL_META[channel].label} fungerar korrekt.`,
        metadata:          { event: 'channel_test', manual: true },
      },
      {
        onSuccess: () => { setTestResult('ok'); toast({ title: 'Testmeddelande skickat' }); },
        onError:   (err) => { setTestResult('error'); toast({ title: 'Testmeddelande misslyckades', description: err instanceof Error ? err.message : undefined, variant: 'destructive' }); },
      },
    );
  }

  function handleSave() {
    const credentials = Object.fromEntries(
      Object.entries(credInputs).filter(([, v]) => v.trim() !== ''),
    );
    update.mutate(
      {
        channel,
        enabled,
        provider:              provider    || null,
        from_address:          fromAddress || null,
        display_name:          displayName || null,
        daily_limit:  parseInt(dailyLimit, 10) || 500,
        ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
      },
      {
        onSuccess: () => { toast({ title: `${meta.label} uppdaterat` }); setCredInputs({}); },
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
            {isPlatformManagedProvider
              ? (enabled ? 'Aktiverad — leverantör hanteras av plattformen' : 'Inaktiverad')
              : (enabled ? (provider ? `Via ${provider}` : 'Aktiverad — välj leverantör') : 'Inaktiverad')}
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
          {isPlatformManagedProvider ? (
            <div className="h-9 flex items-center px-3 text-sm text-muted-foreground border border-dashed border-border rounded-md bg-muted/30">
              Hanteras av plattformen
            </div>
          ) : (
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full h-9 text-sm px-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">— Välj leverantör —</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            {channel === 'email' ? 'Avsändaradress (e-post)' : channel === 'push' ? 'App-ID / Token' : 'Avsändarnummer / -namn'}
          </label>
          <input
            type={channel === 'email' ? 'email' : 'text'}
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder={channel === 'email' ? 'noreply@dinskola.se' : channel === 'sms' ? '+46701234567 eller Din Trafikskola' : '—'}
            className={cn(
              'w-full h-9 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40',
              (senderTooLong || senderDomainInvalid) ? 'border-destructive focus:ring-destructive/40' : 'border-border',
            )}
          />
          {channel === 'sms' && (
            senderTooLong ? (
              <p className="text-[10px] text-destructive">
                Ett textavsändarnamn får max vara {SMS_ALPHA_SENDER_MAX} tecken ({fromAddress.trim().length} just nu) — använd ett kortare namn eller ett telefonnummer.
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">Telefonnummer eller ett textnamn på max {SMS_ALPHA_SENDER_MAX} tecken.</p>
            )
          )}
          {channel === 'email' && (
            senderDomainInvalid ? (
              <p className="text-[10px] text-destructive">
                {senderDomain === PLATFORM_DOMAIN
                  ? `${PLATFORM_DOMAIN} är endast verifierad hos Trafikclouds egen e-postleverantör — med er egen API-nyckel måste avsändaradressen vara på en domän ni själva har verifierat hos ${provider || 'er leverantör'}.`
                  : `${senderDomain} kan inte verifieras hos en e-postleverantör (det är en publik e-posttjänst) — använd en adress på er egen domän.`}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Måste vara en adress på en domän ni har verifierat hos {provider || 'er e-postleverantör'} (t.ex. noreply@dinskola.se).
              </p>
            )
          )}
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

      {/* Platform-managed note (all five channels) */}
      {isPlatformManagedProvider && (
        <div className="border-t border-border pt-4">
          <p className="text-[10px] text-muted-foreground">
            {isSms
              ? 'SMS-leverantören hanteras på plattformsnivå och kan inte konfigureras per skola här. Kontakta plattformens support för att verifiera anslutningsstatus.'
              : isEmail
              ? 'E-postleverantören hanteras på plattformsnivå och kan inte konfigureras per skola här. Kontakta plattformens support för att verifiera anslutningsstatus.'
              : isWhatsapp
              ? 'WhatsApp-leverantören hanteras på plattformsnivå och kan inte konfigureras per skola här. Kontakta plattformens support för att verifiera anslutningsstatus.'
              : isPush
              ? 'Push-leverantören hanteras på plattformsnivå och kan inte konfigureras per skola här. Kontakta plattformens support för att verifiera anslutningsstatus.'
              : 'Röstsamtalsleverantören hanteras på plattformsnivå och kan inte konfigureras per skola här. Kontakta plattformens support för att verifiera anslutningsstatus.'}
          </p>
        </div>
      )}

      {/* Credentials */}
      {!isPlatformManagedProvider && hints.length > 0 && (
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
            Inloggningsuppgifter ({provider})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hints.map((field) => {
              const configured = config?.credentials_configured?.[field] ?? false;
              const masked     = config?.credentials_masked?.[field] ?? null;
              return (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    {FIELD_LABELS[field] ?? field}
                    {configured && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" /> Sparad{masked ? ` (${masked})` : ''}
                      </span>
                    )}
                  </label>
                  <input
                    type={isSecretField(field) ? 'password' : 'text'}
                    value={credInputs[field] ?? ''}
                    onChange={(e) => setCredInputs((c) => ({ ...c, [field]: e.target.value }))}
                    placeholder={configured ? '••••••••  (ange för att ersätta)' : 'Klistra in värde'}
                    autoComplete="off"
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Uppgifterna krypteras och sparas för er organisation — de visas aldrig i klartext igen efter sparande.
          </p>
        </div>
      )}

      {/* Test section */}
      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-xs font-medium text-foreground">Testa kanal</p>
        <div className="flex items-center gap-2">
          <input
            type={channel === 'email' ? 'email' : 'text'}
            value={testAddr}
            onChange={(e) => { setTestAddr(e.target.value); setTestResult('idle'); }}
            placeholder={channel === 'email' ? 'test@example.com' : '+46 70 000 00 00'}
            className="flex-1 h-8 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
            <Button
              size="sm"
              variant="outline"
              disabled={sendMsg.isPending || !testAddr.trim() || !enabled}
              onClick={handleTest}
            >
              {sendMsg.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Testa'}
            </Button>
          </PermissionGate>
          {testResult === 'ok'    && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {testResult === 'error' && <XCircle      className="w-4 h-4 text-destructive shrink-0" />}
        </div>
        {!enabled && (
          <p className="text-[10px] text-muted-foreground">Aktivera kanalen och spara för att kunna skicka test.</p>
        )}
        {!isPlatformManagedProvider && !provider && enabled && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">Välj leverantör och spara innan test.</p>
        )}
      </div>

      {/* Save */}
      <PermissionGate permission={Permissions.COMMUNICATIONS_CREATE}>
        <div className="flex justify-end items-center gap-2 pt-1">
          {invalidEnabledWithoutProvider && (
            <p className="text-[10px] text-destructive">Välj en leverantör för att aktivera kanalen.</p>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={update.isPending || !isDirty || invalidEnabledWithoutProvider || senderTooLong || senderDomainInvalid}
            className={cn((!isDirty || invalidEnabledWithoutProvider || senderTooLong || senderDomainInvalid) && 'opacity-40')}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {update.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </PermissionGate>
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
        description="Aktivera meddelandekanaler och konfigurera avsändare och sändningsgränser"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Kanalinställningar' },
        ]}
      />

      <PageContent>
      <SubscriptionGate feature="communication:templates:manage">
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 px-4 py-2.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            Alla kanaler hanteras av plattformen — inga inloggningsuppgifter behövs. Aktivera en kanal med
            reglaget, fyll i avsändarnamn/-adress och sändningsgräns, och spara.
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
      </SubscriptionGate>
      </PageContent>
    </PageLayout>
  );
}
