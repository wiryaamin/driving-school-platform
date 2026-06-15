import { Link } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── Swedish public holidays ──────────────────────────────────────────────────

interface Holiday {
  name:  string;
  start: string;
  end:   string;
}

const UPCOMING_2026: Holiday[] = [
  { name: 'Midsommardagen',  start: '2026-06-20', end: '2026-06-20' },
  { name: 'Alla helgons dag', start: '2026-10-31', end: '2026-10-31' },
  { name: 'Juldagen',        start: '2026-12-25', end: '2026-12-25' },
  { name: 'Annandag jul',    start: '2026-12-26', end: '2026-12-26' },
];

const PAST_2026: Holiday[] = [
  { name: 'Nationaldagen',          start: '2026-06-06', end: '2026-06-06' },
  { name: 'Pingstdagen',            start: '2026-05-24', end: '2026-05-24' },
  { name: 'Kristi himmelsfärdsdag', start: '2026-05-14', end: '2026-05-14' },
  { name: 'Första maj',             start: '2026-05-01', end: '2026-05-01' },
  { name: 'Annandag påsk',          start: '2026-04-06', end: '2026-04-06' },
  { name: 'Påskdagen',              start: '2026-04-05', end: '2026-04-05' },
  { name: 'Långfredagen',           start: '2026-04-03', end: '2026-04-03' },
  { name: 'Trettondedag jul',       start: '2026-01-06', end: '2026-01-06' },
  { name: 'Nyårsdagen',             start: '2026-01-01', end: '2026-01-01' },
];

const PAST_2025: Holiday[] = [
  { name: 'Annandag jul',           start: '2025-12-26', end: '2025-12-26' },
  { name: 'Juldagen',               start: '2025-12-25', end: '2025-12-25' },
  { name: 'Alla helgons dag',       start: '2025-11-01', end: '2025-11-01' },
  { name: 'Midsommardagen',         start: '2025-06-21', end: '2025-06-21' },
  { name: 'Pingstdagen',            start: '2025-06-08', end: '2025-06-08' },
  { name: 'Nationaldagen',          start: '2025-06-06', end: '2025-06-06' },
  { name: 'Kristi himmelsfärdsdag', start: '2025-05-29', end: '2025-05-29' },
  { name: 'Första maj',             start: '2025-05-01', end: '2025-05-01' },
  { name: 'Annandag påsk',          start: '2025-04-21', end: '2025-04-21' },
  { name: 'Påskdagen',              start: '2025-04-20', end: '2025-04-20' },
  { name: 'Långfredagen',           start: '2025-04-18', end: '2025-04-18' },
  { name: 'Trettondedag jul',       start: '2025-01-06', end: '2025-01-06' },
  { name: 'Nyårsdagen',             start: '2025-01-01', end: '2025-01-01' },
];

// ─── HelgdagarPage ────────────────────────────────────────────────────────────

export function HelgdagarPage() {
  return (
    <div className="max-w-xl space-y-6">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Helgdagar</span>
        </nav>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline">
            Importera helgdagar
          </Button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa helgdag
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
          <Star className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Helgdagar</h1>
        <p className="text-sm text-muted-foreground">
          Hantera helgdagar och lediga dagar för bokningsschemat.
        </p>
      </div>

      {/* Kommande helgdagar 2026 */}
      <HolidaySection title="Kommande helgdagar 2026" holidays={UPCOMING_2026} clickable />

      {/* Tidigare helgdagar 2026 */}
      <HolidaySection title="Tidigare helgdagar 2026" holidays={PAST_2026} />

      {/* Tidigare helgdagar 2025 */}
      <HolidaySection title="Tidigare helgdagar 2025" holidays={PAST_2025} />
    </div>
  );
}

// ─── HolidaySection ───────────────────────────────────────────────────────────

function HolidaySection({ title, holidays, clickable }: {
  title:     string;
  holidays:  Holiday[];
  clickable?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {holidays.map(h => (
          <div
            key={h.name}
            className="flex items-center justify-between px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{h.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {h.start} – {h.end}
              </p>
            </div>
            {clickable && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
