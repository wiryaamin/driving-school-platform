import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList, BookOpen, ExternalLink } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── UndervisningsplanPage ────────────────────────────────────────────────────

export function UndervisningsplanPage() {
  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/education/licenses" className="hover:text-foreground">Utbildning</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Undervisningsplan</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa ny undervisningsplan
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-red-100 text-red-500 flex items-center justify-center shrink-0">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Undervisningsplan</h1>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            Strukturera elevernas utbildningsväg med definierade moment och mål.
            En undervisningsplan kopplas till körkortstypen och guidar läraren genom utbildningen.
          </p>
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Vad är en undervisningsplan?</h2>
        <div className="space-y-2.5">
          {[
            { icon: BookOpen,    text: 'Definiera moment och delmål för varje körkortstyp' },
            { icon: ClipboardList, text: 'Koppla lektioner och kurser till specifika moment' },
            { icon: ExternalLink, text: 'Uppfyll Transportstyrelsens krav på dokumentation' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      <div className="rounded-xl border border-dashed border-border bg-card py-14 flex flex-col items-center gap-4 text-center">
        <ClipboardList className="w-10 h-10 text-muted-foreground/30" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Inga undervisningsplaner skapade</p>
          <p className="text-xs text-muted-foreground">
            Klicka på "Skapa ny undervisningsplan" för att komma igång.
          </p>
        </div>
        <Button size="sm" variant="outline">Skapa ny undervisningsplan</Button>
      </div>
    </div>
  );
}
