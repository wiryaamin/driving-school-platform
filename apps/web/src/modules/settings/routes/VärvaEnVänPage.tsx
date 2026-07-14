import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight, HeartHandshake, Gift, Share2, Trophy } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import {
  useCampaigns, type Campaign, type CampaignStatus,
} from '@modules/campaigns/hooks/useCampaigns.js';

function rewardLabel(c: Campaign): string {
  if (c.bonus_lessons != null) return `${c.bonus_lessons} gratislektioner`;
  if (c.discount_value != null) {
    if (c.discount_is_pct) return `${(c.discount_value * 100).toFixed(0)}% rabatt`;
    return `${c.discount_value} kr rabatt`;
  }
  return '—';
}

function statusLabel(s: CampaignStatus): string {
  const map: Record<CampaignStatus, string> = {
    draft: 'Utkast', scheduled: 'Planerad', active: 'Aktiv',
    paused: 'Pausad', expired: 'Utgången', archived: 'Arkiverad',
  };
  return map[s];
}

function statusColor(s: CampaignStatus): string {
  const map: Record<CampaignStatus, string> = {
    active:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    paused:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    draft:     'bg-muted text-muted-foreground',
    expired:   'bg-muted text-muted-foreground',
    archived:  'bg-muted text-muted-foreground',
  };
  return map[s];
}

// ─── VärvaEnVänPage ───────────────────────────────────────────────────────────

export function VärvaEnVänPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useCampaigns({ per_page: 50 });
  const campaigns = (data?.data ?? []).filter((c) => c.status !== 'archived');

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/customers/config" className="hover:text-foreground">Kunder</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Värva en vän</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" onClick={() => navigate('/campaigns')}>
            Hantera kampanjer
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
          <HeartHandshake className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Värva en vän</h1>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            Belöna befintliga kunder som rekommenderar er till sina vänner.
            Skapa kampanjer med anpassade belöningar för att växa er kundbas.
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Hur det fungerar</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Share2, step: '1', label: 'Kunden delar sin unika länk' },
            { icon: Gift,   step: '2', label: 'Vännen registrerar sig' },
            { icon: Trophy, step: '3', label: 'Båda får en belöning' },
          ].map(({ icon: Icon, step, label }) => (
            <div key={step} className="flex flex-col items-center text-center gap-2">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center relative">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                  {step}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 flex flex-col items-center gap-3 text-center">
          <HeartHandshake className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Inga kampanjer skapade ännu.</p>
          <Button size="sm" variant="outline" onClick={() => navigate('/campaigns')}>
            Skapa din första kampanj
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground">Kampanj</span>
            <span className="text-xs font-semibold text-muted-foreground">Belöning</span>
            <span className="text-xs font-semibold text-muted-foreground">Status</span>
            <span />
          </div>
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors"
            >
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <span className="text-sm text-muted-foreground">{rewardLabel(c)}</span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor(c.status)}`}>
                {statusLabel(c.status)}
              </span>
              <Link
                to={`/campaigns/${c.id}`}
                className="text-xs text-primary hover:underline whitespace-nowrap"
              >
                Visa →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
