import { Link } from 'react-router-dom';
import { ChevronRight, PenLine, Layers } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── MarknadsföringPage ───────────────────────────────────────────────────────

export function MarknadsföringPage() {
  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + feedback */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/addons/marketing" className="hover:text-foreground">Tillägg</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Marknadsföringsautomation</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Hero header */}
      <div className="rounded-xl bg-slate-900 text-white p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center text-2xl shrink-0">
          🚀
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">Marknadsföring</h1>
          <p className="text-sm text-slate-300">Smarta verktyg för din marknadsföring</p>
        </div>
        <Button className="bg-green-500 hover:bg-green-600 text-white shrink-0">
          Installera
        </Button>
      </div>

      {/* Status */}
      <div className="rounded-xl border border-border bg-card px-5 py-3 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
        <span className="text-sm text-muted-foreground">Inte installerad</span>
      </div>

      {/* Översikt */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Översikt</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Jobba smartare med vår marknadsföringsmodul. Börja med att skapa personliga budskap med
          hjälp av våra grafiska e-postmallar. Vår ambition är att stegvis automatisera utvalda
          flöden, så att ni sparar tid och kan fokusera på det ni gör bäst.
        </p>
      </div>

      {/* Funktioner */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Funktioner</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <PenLine className="w-5 h-5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">Grafiska e-postmallar</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Skapa professionella, responsiva e-postmallar som ser bra ut på alla enheter. Du kan
              själv anpassa färger, typsnitt och layout efter er grafiska identitet.
            </p>
          </div>
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">Automatisering</span>
            </div>
            <p className="text-xs text-muted-foreground">Kommer snart!</p>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="rounded-xl border border-border bg-muted/30 p-8 text-center space-y-1">
        <p className="text-2xl font-bold text-green-600">Gratis</p>
        <p className="text-sm font-medium text-foreground">Under testperioden, vi informerar er när den går in ny fas</p>
        <p className="text-sm text-muted-foreground">Därefter kommer denna modul att kosta 499 kr/månad</p>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
        <h2 className="text-base font-semibold text-foreground">Kom igång med tillägget</h2>
        <p className="text-sm text-muted-foreground">
          Aktivera integrationen och börja skapa era första kampanjer redan idag.
        </p>
        <Button className="bg-green-500 hover:bg-green-600 text-white px-8">
          Installera marknadsföringsmodulen
        </Button>
      </div>
    </div>
  );
}
