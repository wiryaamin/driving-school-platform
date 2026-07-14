import { Link } from 'react-router-dom';
import { Bell, ChevronRight, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useSession } from '@shared/hooks/useSession.js';
import {
  useNotificationPreferences,
  useUpsertPreference,
  type NotificationPreference,
} from '../hooks/useNotifications.js';

// ─── Constants ────────────────────────────────────────────────────────────────

type PrefChannel = 'email' | 'sms' | 'push';

const CHANNELS: Array<{ value: PrefChannel; label: string; Icon: typeof Mail }> = [
  { value: 'email', label: 'E-post',  Icon: Mail },
  { value: 'sms',   label: 'SMS',     Icon: MessageSquare },
  { value: 'push',  label: 'Push',    Icon: Smartphone },
];

const NOTIFICATION_TYPES: Array<{ value: string; label: string; description: string }> = [
  { value: 'booking_reminder',    label: 'Bokningspåminnelse',    description: 'Påminnelser 24h och 2h innan lektionen' },
  { value: 'booking_confirmation',label: 'Bokningsbekräftelse',   description: 'Bekräftelse direkt när en bokning skapas' },
  { value: 'booking_cancellation',label: 'Avbokning',             description: 'Notis när en bokning avbokas' },
  { value: 'invoice_notification', label: 'Fakturering',          description: 'Nya fakturor och betalningspåminnelser' },
  { value: 'waitlist_notification',label: 'Väntelista',           description: 'Notis när en väntelisteplacering aktiveras' },
  { value: 'instructor_digest',    label: 'Daglig schemaöversikt',description: 'Instruktörens schema varje morgon (instruktörer)' },
];

// ─── Toggle cell ──────────────────────────────────────────────────────────────

function PrefToggle({
  enabled,
  onToggle,
  isPending,
}: {
  enabled:   boolean;
  onToggle:  () => void;
  isPending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isPending}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50',
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
  );
}

// ─── Preferences grid ─────────────────────────────────────────────────────────

function PreferencesGrid({
  profileId,
  prefs,
}: {
  profileId: string;
  prefs:     NotificationPreference[];
}) {
  const upsert = useUpsertPreference();

  function isEnabled(notificationType: string, channel: PrefChannel): boolean {
    const match = prefs.find(
      (p) => p.notification_type === notificationType && p.channel === channel,
    );
    return match?.enabled ?? true; // default opt-in
  }

  function handleToggle(notificationType: string, channel: PrefChannel) {
    const current = isEnabled(notificationType, channel);
    upsert.mutate(
      { profile_id: profileId, channel, notification_type: notificationType, enabled: !current },
      {
        onSuccess: () => toast({ title: current ? 'Notis inaktiverad' : 'Notis aktiverad' }),
        onError:   () => toast({ title: 'Kunde inte spara inställning', variant: 'destructive' }),
      },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground min-w-[220px]">
                Notistyp
              </th>
              {CHANNELS.map((ch) => (
                <th key={ch.value} className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground w-24">
                  <div className="flex flex-col items-center gap-1">
                    <ch.Icon className="w-3.5 h-3.5" />
                    {ch.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {NOTIFICATION_TYPES.map((nt) => (
              <tr key={nt.value} className="hover:bg-accent/10 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{nt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{nt.description}</p>
                </td>
                {CHANNELS.map((ch) => (
                  <td key={ch.value} className="px-4 py-3 text-center">
                    <div className="flex justify-center">
                      <PrefToggle
                        enabled={isEnabled(nt.value, ch.value)}
                        onToggle={() => handleToggle(nt.value, ch.value)}
                        isPending={upsert.isPending}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── NotificationPreferencesPage ──────────────────────────────────────────────

export function NotificationPreferencesPage() {
  const { profile } = useSession();
  const profileId = profile?.id ?? null;

  const { data: prefs = [], isLoading } = useNotificationPreferences(profileId);

  return (
    <PageLayout>
      <PageHeader
        title="Notifieringsinställningar"
        description="Välj vilka notiser du vill ta emot och via vilken kanal"
        breadcrumbs={[
          { label: 'Kommunikation', href: '/communication' },
          { label: 'Notifieringsinställningar' },
        ]}
      />

      <PageContent>

        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 px-4 py-2.5">
          <Bell className="w-3.5 h-3.5 shrink-0" />
          <span>
            Dessa inställningar gäller för ditt personliga konto. Kanalerna måste vara konfigurerade av din organisation för att notiser ska kunna skickas.{' '}
            <Link to="/communication/settings" className="underline hover:text-foreground">Kanalinställningar →</Link>
          </span>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-3">
              {NOTIFICATION_TYPES.map((nt) => (
                <div key={nt.value} className="flex items-center gap-4">
                  <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                  <div className="w-9 h-5 bg-muted rounded-full animate-pulse" />
                  <div className="w-9 h-5 bg-muted rounded-full animate-pulse" />
                  <div className="w-9 h-5 bg-muted rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ) : !profileId ? (
          <div className="rounded-xl border border-border bg-card py-12 flex flex-col items-center gap-3">
            <Bell className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Kunde inte ladda profilinformation.</p>
          </div>
        ) : (
          <PreferencesGrid profileId={profileId} prefs={prefs} />
        )}

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ChevronRight className="w-3 h-3" />
          <span>
            Org-övergripande regler hanteras i{' '}
            <Link to="/communication/rules" className="underline hover:text-foreground">Notisregler</Link>
            {' '}och{' '}
            <Link to="/settings/communication/automation" className="underline hover:text-foreground">Automatiseringsregler</Link>.
          </span>
        </div>

      </PageContent>
    </PageLayout>
  );
}
