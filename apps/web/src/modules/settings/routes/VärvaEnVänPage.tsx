import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, HeartHandshake, Gift, Share2, Trophy } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';

interface Campaign {
  id:      number;
  name:    string;
  reward:  string;
  active:  boolean;
  uses:    number;
}

const EXAMPLE_CAMPAIGNS: Campaign[] = [
  { id: 1, name: 'Vänkampanj vår 2025', reward: '500 kr rabatt',     active: true,  uses: 12 },
  { id: 2, name: 'Sommarkampanj 2024',   reward: '1 gratis lektion', active: false, uses: 8  },
];

// ─── VärvaEnVänPage ───────────────────────────────────────────────────────────

export function VärvaEnVänPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(EXAMPLE_CAMPAIGNS);

  function toggle(id: number) {
    setCampaigns(prev =>
      prev.map(c => c.id === id ? { ...c, active: !c.active } : c),
    );
  }

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
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Ny kampanj
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
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 flex flex-col items-center gap-3 text-center">
          <HeartHandshake className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Inga kampanjer skapade ännu.</p>
          <Button size="sm" variant="outline">Skapa din första kampanj</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground">Kampanj</span>
            <span className="text-xs font-semibold text-muted-foreground">Belöning</span>
            <span className="text-xs font-semibold text-muted-foreground">Användningar</span>
            <span className="text-xs font-semibold text-muted-foreground">Status</span>
          </div>
          {campaigns.map(c => (
            <div key={c.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors">
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <span className="text-sm text-muted-foreground">{c.reward}</span>
              <span className="text-sm text-muted-foreground text-center">{c.uses}</span>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className={cn(
                  'text-xs font-semibold px-3 py-1 rounded-full transition-colors',
                  c.active
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {c.active ? 'Aktiv' : 'Inaktiv'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
