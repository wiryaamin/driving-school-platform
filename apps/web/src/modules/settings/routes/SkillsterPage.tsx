import { Link } from 'react-router-dom';
import { ChevronRight, Gauge, Timer, ChartBar, CheckCircle } from 'lucide-react';
import { Button } from '@platform/ui';

const FEATURES = [
  { icon: Timer,       title: 'Prestation',               desc: 'Få en inblick i hur många moment eleven har klarat av.' },
  { icon: ChartBar,   title: 'Spåra varningar',          desc: 'Automatisk synkronisering av elevens varningar' },
  { icon: CheckCircle, title: 'Kompletterande utbildning', desc: 'Kombinera praktisk undervisning med realistisk simulatorträning' },
];

export function SkillsterPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/addons/marketing" className="hover:text-foreground">Tillägg</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Skillster</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
          <Gauge className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">Skillster</h1>
          <p className="text-sm text-muted-foreground">Realistisk körsimulator som kompletterar praktisk undervisning</p>
        </div>
        <Button className="shrink-0">Installera</Button>
      </div>

      {/* Status */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-foreground">Inte installerad</span>
      </div>

      {/* Översikt */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Översikt</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Teoricentralen kan hämta information från Skillster som erbjuder en realistisk körsimulator och
          kompletterar den praktiska undervisningen. Integrationen gör det enkelt att följa upp elevens
          utveckling direkt i Teoricentralen.
        </p>
      </div>

      {/* Funktioner */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Funktioner</h2>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-4 flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-border bg-card px-5 py-10 text-center space-y-3">
        <h2 className="text-base font-semibold text-foreground">Kom igång med tillägget</h2>
        <p className="text-sm text-muted-foreground">
          Aktivera integrationen och börja synkronisera elevernas framsteg från körsimulator till Teoricentralen.
        </p>
        <Button>Installera Skillster-integration</Button>
      </div>
    </div>
  );
}
