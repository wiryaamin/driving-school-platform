import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare, ArrowRight, Mail, Smartphone, FileText, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Canonical owners ─────────────────────────────────────────────────────────
//
// Every field this page used to save lived in organizations.settings.communication,
// a JSONB blob nothing ever read. Auditing each field against the real backend
// found:
//   - SMS/e-post på/av + avsändare        → channel_configs        (ChannelSettingsPage, /communication/settings)
//   - Anpassad meddelandemall              → notification_templates (TemplateManagementPage, /communication/templates)
//   - Dagligt schema-mejl till lärare       → notification_rules, trigger=instructor_schedule_daily (NotificationRulesPage, /communication/rules)
// Those three already have full, working admin UIs — this page only shows a
// read-only status per capability and links out, so there is exactly one
// editable surface for each.
//
// The remaining fields (SMS/e-post-signatur, påminnelsetid, nya elevers
// SMS-standard, dagligt SMS-statusmejl, betalningskvitto via mejl,
// TABSwebb-bokningsförfrågningar, kopia/avbokningsmejl till lärare, mejl vid
// misslyckad leverans) have no backend anywhere in the codebase — no table
// column, no Edge Function, no scheduled job consumes them. They are removed
// rather than kept as toggles that silently save to nothing.

type Channel = 'sms' | 'email';

interface ChannelConfigRow {
  channel: Channel;
  enabled: boolean;
  from_address: string | null;
}

function useChannelStatus(orgId: string | undefined) {
  return useQuery<ChannelConfigRow[]>({
    queryKey: ['settings-communication-channel-status', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('channel_configs')
        .select('channel, enabled, from_address')
        .eq('organization_id', orgId)
        .in('channel', ['sms', 'email']);
      if (error) throw error;
      return (data ?? []) as ChannelConfigRow[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });
}

function useInstructorDigestStatus(orgId: string | undefined) {
  return useQuery<{ channel: Channel; enabled: boolean }[]>({
    queryKey: ['settings-communication-instructor-digest', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('notification_rules')
        .select('channel, enabled')
        .eq('organization_id', orgId)
        .eq('recipient_type', 'instructor')
        .eq('trigger_event', 'instructor_schedule_daily')
        .in('channel', ['sms', 'email']);
      if (error) throw error;
      return (data ?? []) as { channel: Channel; enabled: boolean }[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });
}

function useOrgTemplateOverrideCount(orgId: string | undefined) {
  return useQuery<number>({
    queryKey: ['settings-communication-template-overrides', orgId],
    queryFn: async () => {
      if (!orgId) return 0;
      const { count, error } = await supabase
        .from('notification_templates')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });
}

function StatusLink({
  icon: Icon, title, statusText, statusOn, linkTo,
}: {
  icon: typeof MessageSquare; title: string; statusText: string; statusOn: boolean; linkTo: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className={`text-xs mt-0.5 ${statusOn ? 'text-green-600' : 'text-muted-foreground'}`}>{statusText}</p>
        </div>
      </div>
      <Link to={linkTo} className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
        Hantera <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

export function KommunikationConfigPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: channelRows = [], isLoading: channelsLoading } = useChannelStatus(orgId);
  const { data: digestRows  = [], isLoading: digestLoading }   = useInstructorDigestStatus(orgId);
  const { data: overrideCount = 0, isLoading: templatesLoading } = useOrgTemplateOverrideCount(orgId);

  const smsConfig   = channelRows.find(r => r.channel === 'sms');
  const emailConfig = channelRows.find(r => r.channel === 'email');
  const digestOn    = digestRows.some(r => r.enabled);

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kommunikation</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Kommunikation</h1>
        <p className="text-sm text-muted-foreground">SMS, e-post och notiser hanteras på en gemensam plats per funktion.</p>
      </div>

      <div className="space-y-3">
        {channelsLoading ? (
          <p className="text-xs text-muted-foreground px-1">Laddar…</p>
        ) : (
          <>
            <StatusLink
              icon={Smartphone}
              title="SMS"
              statusText={smsConfig?.enabled ? `Aktiverad${smsConfig.from_address ? ` · Avsändare: ${smsConfig.from_address}` : ''}` : 'Inaktiverad'}
              statusOn={smsConfig?.enabled ?? false}
              linkTo="/communication/settings"
            />
            <StatusLink
              icon={Mail}
              title="E-post"
              statusText={emailConfig?.enabled ? `Aktiverad${emailConfig.from_address ? ` · Avsändare: ${emailConfig.from_address}` : ''}` : 'Inaktiverad'}
              statusOn={emailConfig?.enabled ?? false}
              linkTo="/communication/settings"
            />
          </>
        )}

        {templatesLoading ? (
          <p className="text-xs text-muted-foreground px-1">Laddar…</p>
        ) : (
          <StatusLink
            icon={FileText}
            title="Meddelandemallar"
            statusText={overrideCount > 0 ? `${overrideCount} egna mallar` : 'Använder standardmallar'}
            statusOn={overrideCount > 0}
            linkTo="/communication/templates"
          />
        )}

        {digestLoading ? (
          <p className="text-xs text-muted-foreground px-1">Laddar…</p>
        ) : (
          <StatusLink
            icon={Bell}
            title="Dagligt scheman via e-post/SMS till lärare"
            statusText={digestOn ? 'Aktivt' : 'Inaktivt'}
            statusOn={digestOn}
            linkTo="/communication/rules"
          />
        )}
      </div>
    </div>
  );
}
