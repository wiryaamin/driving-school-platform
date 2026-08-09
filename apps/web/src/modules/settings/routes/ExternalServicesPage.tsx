import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Plug, Fingerprint, ShieldCheck, MessageSquare, Mail,
  BookOpen, Calculator, Calendar, Building2, CheckCircle2, XCircle,
  Loader2, Clock, Lock, AlertTriangle, Car, Settings2,
} from 'lucide-react';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, toast,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { useSession } from '@shared/hooks/useSession.js';
import { resolveIntegrationStatusError, type IntegrationStatus } from '@shared/lib/integrationStatus.js';
import {
  usePersonLookupStatus, usePersonLookupConfig, useUpdatePersonLookupConfig,
} from '@modules/students/hooks/usePersonLookup.js';
import {
  useVehicleRegistryStatus, useVehicleRegistryConfig, useUpdateVehicleRegistryConfig,
} from '@modules/resources/hooks/useVehicleRegistryLookup.js';
import { useChannelConfigs } from '@modules/communication/hooks/useCommunication.js';
import { useFortnoxStatus } from '@modules/finance/hooks/useFortnoxStatus.js';

// ─── Status model (ADR-009 / Sprint 6A) ───────────────────────────────────────
//
// The approved six-value status vocabulary, shared with every other
// consumer via @shared/lib/integrationStatus.ts:
//   connected               — actively configured and reachable
//   not_connected            — reachable to configure, but not connected yet
//   subscription_required   — a business restriction, not a failure (HTTP 402)
//   platform_managed        — configured centrally, not per-tenant (e.g. BankID)
//   coming_soon             — no backend yet, informational only
//   unknown_error           — an unexpected technical problem (401/403/404/5xx/network)
//
// A card's first status fetch (no cached data yet) renders a neutral loading
// state instead of any of the above — see IntegrationCard's `loading` prop.

type StatusKind = IntegrationStatus;

const STATUS_CONFIG: Record<StatusKind, { label: string; variant: 'success' | 'destructive' | 'secondary' | 'outline' | 'warning'; icon: typeof CheckCircle2 }> = {
  connected:              { label: 'Ansluten',                 variant: 'success',     icon: CheckCircle2  },
  not_connected:          { label: 'Ej ansluten',              variant: 'destructive', icon: XCircle       },
  subscription_required:  { label: 'Kräver uppgraderad plan',  variant: 'warning',     icon: Lock          },
  platform_managed:       { label: 'Plattformshanterad',       variant: 'secondary',   icon: ShieldCheck   },
  coming_soon:            { label: 'Kommer snart',             variant: 'outline',     icon: Clock         },
  unknown_error:          { label: 'Okänt fel',                variant: 'destructive', icon: AlertTriangle },
};

interface MetaRow { label: string; value: string; }

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Standardized integration card ───────────────────────────────────────────
//
// Every card in this hub follows the same shape: name + provider + status +
// short description, optional key/value metadata (e.g. last connection),
// an optional freeform note, and an optional action row (test/configure/
// view details). Cards for integrations without a real backend yet render
// with status="coming_soon" and no actions — never fake functionality.

function IntegrationCard({
  icon: Icon, title, provider, status, loading = false, statusMessage, description, meta = [], extra, note, actions,
}: {
  icon:           typeof Plug;
  title:          string;
  provider?:      string | undefined;
  status:         StatusKind;
  /** First fetch, no cached data yet — render a neutral loading badge instead
   *  of guessing a status from incomplete data. */
  loading?:       boolean;
  /** User-safe explanation shown under the status (e.g. a subscription
   *  restriction or an unexpected-error hint). Never raw HTTP text. */
  statusMessage?: string | undefined;
  description:    string;
  meta?:          MetaRow[];
  extra?:         ReactNode | undefined;
  note?:          string | undefined;
  actions?:       ReactNode;
}) {
  const s = STATUS_CONFIG[status];
  const StatusIcon = loading ? Loader2 : s.icon;
  return (
    <Card className={status === 'coming_soon' ? 'opacity-60' : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2.5 text-sm font-semibold">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </span>
            <span className="truncate">{title}</span>
          </span>
          {loading ? (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" /> Hämtar status…
            </Badge>
          ) : (
            <Badge variant={s.variant} className="gap-1 text-[10px] font-normal shrink-0">
              <StatusIcon className="w-3 h-3" /> {s.label}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground pl-[42px]">{description}</p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {(provider || meta.length > 0) && (
          <div className="space-y-1.5">
            {provider && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Leverantör</span>
                <span className="font-medium text-foreground">{provider}</span>
              </div>
            )}
            {meta.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium text-foreground tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {extra}
        {!loading && statusMessage && (
          <p className={cn(
            'text-[11px] rounded-md px-2.5 py-1.5 border',
            status === 'subscription_required'
              ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40'
              : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40',
          )}>
            {statusMessage}
          </p>
        )}
        {note && (
          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">{note}</p>
        )}
        {actions}
      </CardContent>
    </Card>
  );
}

function ServiceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

// ─── Identity Services ────────────────────────────────────────────────────────

const CAPABILITY_LABELS: Record<string, string> = {
  address:      'Adress',
  municipality: 'Kommun',
  gender:       'Kön',
  postalCode:   'Postnummer',
  dateOfBirth:  'Födelsedatum',
};

function PersonLookupConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: config } = usePersonLookupConfig({ enabled: open });
  const update = useUpdatePersonLookupConfig();
  const [provider, setProvider] = useState<'mock' | 'roaring'>('mock');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // Sync the provider dropdown to the current config whenever the dialog opens.
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  if (open && config && syncedFor !== config.active_provider) {
    setSyncedFor(config.active_provider);
    setProvider(config.active_provider === 'roaring' ? 'roaring' : 'mock');
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        active_provider: provider,
        ...(provider === 'roaring' && clientId && clientSecret ? { client_id: clientId, client_secret: clientSecret } : {}),
      });
      toast({ title: 'Personuppslag uppdaterat' });
      setClientId(''); setClientSecret('');
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte spara', variant: 'destructive', description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Konfigurera Personuppslag</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mock kräver ingen inloggning. Roaring kräver ett Client ID + Client Secret från er Roaring-sandlåda (developer.roaring.io).
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Leverantör</label>
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'mock' | 'roaring')}
            >
              <option value="mock">Mock (testdata, ingen anslutning)</option>
              <option value="roaring">Roaring</option>
            </select>
          </div>
          {provider === 'roaring' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Client ID {config?.credentials_configured && '(lämna tomt för att behålla nuvarande)'}
                </label>
                <input className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="962c8514-..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Client Secret</label>
                <input className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm" type="password"
                  value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="8523b6fa-..." />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={update.isPending}>Avbryt</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonLookupCard() {
  const { data, error, isLoading, isError, refetch, isFetching } = usePersonLookupStatus();
  const resolved = isError ? resolveIntegrationStatusError(error) : null;
  const status: StatusKind = resolved?.status ?? (data?.connected ? 'connected' : 'not_connected');
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <>
      <IntegrationCard
        icon={Fingerprint}
        title="Personuppslag"
        description="Hämtar person­uppgifter vid elevregistrering (t.ex. Statens personadressregister)."
        provider={data ? data.provider : undefined}
        status={status}
        loading={isLoading}
        statusMessage={resolved?.message}
        extra={data && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Tillgängliga uppgifter
            </p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.capabilities)
                .filter(([, supported]) => supported)
                .map(([key]) => (
                  <Badge key={key} variant="secondary" className="text-[10px] font-normal">
                    {CAPABILITY_LABELS[key] ?? key}
                  </Badge>
                ))}
            </div>
          </div>
        )}
        note={data?.provider === 'mock'
          ? 'Testleverantör aktiv — konfigurera Roaring nedan för riktiga uppslag.'
          : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setConfigOpen(true)}>
              <Settings2 className="w-3.5 h-3.5" /> Konfigurera
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Testa
            </Button>
          </div>
        }
      />
      <PersonLookupConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  );
}

// ─── Vehicle Registry ──────────────────────────────────────────────────────────

const VEHICLE_CAPABILITY_LABELS: Record<string, string> = {
  registrationStatus: 'Registreringsstatus',
  inspectionData:     'Besiktningsdata',
  technicalData:      'Teknisk data',
  debtInfo:           'Skuldinformation',
  ownerData:          'Ägaruppgifter',
};

function VehicleRegistryConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: config } = useVehicleRegistryConfig({ enabled: open });
  const update = useUpdateVehicleRegistryConfig();
  const [provider, setProvider] = useState<'mock' | 'biluppgifter'>('mock');
  const [apiKey, setApiKey] = useState('');

  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  if (open && config && syncedFor !== config.active_provider) {
    setSyncedFor(config.active_provider);
    setProvider(config.active_provider === 'biluppgifter' ? 'biluppgifter' : 'mock');
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        active_provider: provider,
        ...(provider === 'biluppgifter' && apiKey ? { api_key: apiKey } : {}),
      });
      toast({ title: 'Fordonsuppslag uppdaterat' });
      setApiKey('');
      onClose();
    } catch (err) {
      toast({ title: 'Kunde inte spara', variant: 'destructive', description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} aria-describedby={undefined}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Konfigurera Fordonsuppslag</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mock kräver ingen inloggning. Biluppgifter.se kräver en API-nyckel — kontakta deras säljteam för en testnyckel.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Leverantör</label>
            <select
              className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'mock' | 'biluppgifter')}
            >
              <option value="mock">Mock (testdata, ingen anslutning)</option>
              <option value="biluppgifter">Biluppgifter.se</option>
            </select>
          </div>
          {provider === 'biluppgifter' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                API-nyckel {config?.credentials_configured && '(lämna tomt för att behålla nuvarande)'}
              </label>
              <input className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm" type="password"
                value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API-nyckel från Biluppgifter.se" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose} disabled={update.isPending}>Avbryt</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={update.isPending}>
            {update.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehicleRegistryCard() {
  const { data, error, isLoading, isError, refetch, isFetching } = useVehicleRegistryStatus();
  const resolved = isError ? resolveIntegrationStatusError(error) : null;
  const status: StatusKind = resolved?.status ?? (data?.connected ? 'connected' : 'not_connected');
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <>
      <IntegrationCard
        icon={Car}
        title="Fordonsuppslag"
        description="Hämtar registrerings- och besiktningsuppgifter från vägtrafikregistret (via Biluppgifter.se)."
        provider={data ? data.provider : undefined}
        status={status}
        loading={isLoading}
        statusMessage={resolved?.message}
        extra={data && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Tillgängliga uppgifter
            </p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.capabilities)
                .filter(([, supported]) => supported)
                .map(([key]) => (
                  <Badge key={key} variant="secondary" className="text-[10px] font-normal">
                    {VEHICLE_CAPABILITY_LABELS[key] ?? key}
                  </Badge>
                ))}
            </div>
          </div>
        )}
        note={data?.provider === 'mock'
          ? 'Testleverantör aktiv — konfigurera Biluppgifter.se nedan för riktiga uppslag. Kräver även ett direktåtkomsttillstånd från Transportstyrelsen.'
          : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setConfigOpen(true)}>
              <Settings2 className="w-3.5 h-3.5" /> Konfigurera
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Testa
            </Button>
          </div>
        }
      />
      <VehicleRegistryConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  );
}

function BankidCard() {
  return (
    <IntegrationCard
      icon={ShieldCheck}
      title="BankID"
      description="Identitetsverifiering vid inloggning."
      status="platform_managed"
      note="BankID-uppgifter hanteras på plattformsnivå och kan inte konfigureras per skola här. Kontakta plattformens support för att verifiera anslutningsstatus."
    />
  );
}

// ─── Communication ────────────────────────────────────────────────────────────

function ChannelCard({
  channel, icon, title, description,
}: {
  channel: 'sms' | 'email'; icon: typeof Plug; title: string; description: string;
}) {
  const { data: configs, error, isLoading, isError } = useChannelConfigs();
  const config = configs?.find((c) => c.channel === channel);
  const resolved = isError ? resolveIntegrationStatusError(error) : null;
  const status: StatusKind = resolved?.status ?? ((config?.enabled && config.provider) ? 'connected' : 'not_connected');

  return (
    <IntegrationCard
      icon={icon}
      title={title}
      description={description}
      provider={config?.provider ?? undefined}
      status={status}
      loading={isLoading}
      statusMessage={resolved?.message}
      actions={
        <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
          <Link to="/communication/settings">
            Hantera {title.toLowerCase()}-inställningar <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      }
    />
  );
}

// ─── Accounting ───────────────────────────────────────────────────────────────

function FortnoxCard() {
  const { organization } = useSession();
  const { data, error, isLoading, isError } = useFortnoxStatus(organization?.id);
  const resolved = isError ? resolveIntegrationStatusError(error) : null;
  const status: StatusKind = resolved?.status ?? (data?.connected ? 'connected' : 'not_connected');

  const meta: MetaRow[] = [];
  if (!isLoading && !isError) {
    meta.push({
      label: 'Senaste lyckade anslutning',
      value: data?.connected_at ? fmtDateTime(data.connected_at) : 'Ej tillgängligt',
    });
  }

  return (
    <IntegrationCard
      icon={BookOpen}
      title="Fortnox"
      description="Bokföringsexport samt kund- och fakturasynkronisering."
      provider={data?.method === 'oauth' ? 'OAuth 2.0' : data?.method === 'api_token' ? 'API-token' : undefined}
      status={status}
      loading={isLoading}
      statusMessage={resolved?.message}
      meta={meta}
      actions={
        <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
          <Link to="/finance/fortnox">
            Visa detaljer och hantera <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </Button>
      }
    />
  );
}

// ─── Coming-soon cards — Accounting / Scheduling ──────────────────────────────

function ComingSoonCard({
  icon, title, description,
}: {
  icon: typeof Plug; title: string; description: string;
}) {
  return (
    <IntegrationCard
      icon={icon}
      title={title}
      description={description}
      status="coming_soon"
      note="Tillgängligt i en framtida version."
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ExternalServicesPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Externa tjänster</span>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Plug className="w-5 h-5 text-muted-foreground" />
          Externa tjänster
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Samlad översikt över integrationer och tredjepartstjänster kopplade till Trafikcloud.
        </p>
      </div>

      <ServiceSection title="Identitetstjänster">
        <PersonLookupCard />
        <BankidCard />
      </ServiceSection>

      <ServiceSection title="Fordon">
        <VehicleRegistryCard />
        <IntegrationCard
          icon={ShieldCheck}
          title="Myndighetsärenden"
          description="Manuell spårning av ärenden hos Transportstyrelsen/Trafikverket som saknar API (riskutbildning, tillstånd, förarprovsbokning)."
          status="platform_managed"
          note="Ingen extern anslutning krävs — hanteras helt inom Trafikcloud."
          actions={
            <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
              <Link to="/regulatory">
                Öppna Myndighetsärenden <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          }
        />
      </ServiceSection>

      <ServiceSection title="Kommunikation">
        <ChannelCard channel="sms" icon={MessageSquare} title="SMS" description="Leverantör, avsändarnummer och testmeddelanden." />
        <ChannelCard channel="email" icon={Mail} title="Email" description="Leverantör, avsändaradress och testmeddelanden." />
      </ServiceSection>

      <ServiceSection title="Bokföring">
        <FortnoxCard />
        <ComingSoonCard
          icon={Calculator}
          title="Visma"
          description="Bokföringsexport till Visma är planerat för Version 1.1."
        />
      </ServiceSection>

      <ServiceSection title="Schemaläggning">
        <ComingSoonCard
          icon={Calendar}
          title="Google Kalender"
          description="Kalendersynkronisering är inte tillgänglig ännu."
        />
        <ComingSoonCard
          icon={Building2}
          title="Microsoft 365"
          description="Kalender- och e-postsynkronisering är inte tillgänglig ännu."
        />
      </ServiceSection>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Framtida integrationer</h2>
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">
            Reserverat för kommande plattformsintegrationer. Inget att visa just nu.
          </p>
        </div>
      </div>
    </div>
  );
}
