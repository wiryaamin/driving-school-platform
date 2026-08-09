import { Link } from 'react-router-dom';
import { Mail, MessageSquare, AlertCircle } from 'lucide-react';
import { Skeleton, Badge } from '@platform/ui';
import { PageLayout, PageHeader } from '@shared/components/layout/PageLayout/PageLayout.js';
import { usePlatformCommunicationsSummary } from '../hooks/usePlatformOpsCenter.js';

const CHANNEL_ICON: Record<string, React.ElementType> = { email: Mail, sms: MessageSquare };
const CHANNEL_LABEL: Record<string, string> = { email: 'E-post', sms: 'SMS', push: 'Push', in_app: 'I appen' };

/**
 * Communications — platform-wide message deliverability, reusing the
 * existing `outbound_messages` table (no new tracking) via the new
 * `get_platform_communications_summary` aggregate RPC. Welcome-email /
 * invitation status for a specific administrator still lives on
 * Organization Detail's Administratörer tab — this page is the cross-org
 * deliverability view, not a duplicate of that per-person status.
 */
export function PlatformCommunicationsPage() {
  const { data, isLoading, error } = usePlatformCommunicationsSummary();

  return (
    <PageLayout>
      <PageHeader title="Kommunikation" description="Meddelandeleverans över hela plattformen, senaste 7 dagarna" />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Kommunikationsöversikt ej tillgänglig</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {isLoading && [1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        {!isLoading && (data?.by_channel ?? []).map((c) => {
          const Icon = CHANNEL_ICON[c.channel] ?? Mail;
          return (
            <div key={c.channel} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">{CHANNEL_LABEL[c.channel] ?? c.channel}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-foreground font-medium">{c.sent} skickade</span>
                <span className={c.failed > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>{c.failed} misslyckade</span>
                <span className="text-muted-foreground">{c.pending} väntande</span>
              </div>
            </div>
          );
        })}
        {!isLoading && (data?.by_channel ?? []).length === 0 && (
          <p className="col-span-full py-8 text-sm text-muted-foreground text-center">Ingen kommunikationsaktivitet senaste 7 dagarna</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Senaste misslyckade meddelanden</p>
        </div>
        {!isLoading && (data?.recent_failed ?? []).length === 0 && (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">Inga misslyckade meddelanden</p>
        )}
        {(data?.recent_failed ?? []).length > 0 && (
          <div className="divide-y divide-border">
            {data!.recent_failed.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/platform/organizations/${m.organization_id}`} className="text-sm font-medium text-foreground hover:text-primary truncate">
                    {m.org_name ?? m.organization_id}
                  </Link>
                  <Badge variant="outline" className="text-[10px] shrink-0">{CHANNEL_LABEL[m.channel] ?? m.channel}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{m.recipient_address ?? '—'}</p>
                {m.error_message && <p className="text-xs text-destructive truncate mt-0.5">{m.error_message}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
