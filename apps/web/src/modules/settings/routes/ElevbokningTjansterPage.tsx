import { Link } from 'react-router-dom';
import { Key, ChevronRight } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── Static service definitions ───────────────────────────────────────────────
// In a production system these would come from a booking_services table.

interface BookingService {
  id:     string;
  label:  string;
  order:  number;
  active: boolean;
}

const SERVICES: BookingService[] = [
  { id: 'korlektioner',   label: 'Boka körlektion',    order: 10, active: true  },
  { id: 'teorilektioner', label: 'Boka teorilektion',  order: 20, active: false },
];

// ─── ElevbokningTjansterPage ──────────────────────────────────────────────────

export function ElevbokningTjansterPage() {
  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Elevbokning</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa tjänst
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Key className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Elevbokning</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurera elevernas möjlighet att boka in körlektioner och kurser.
        </p>
      </div>

      {/* Service list */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {SERVICES.map(service => (
          <button
            key={service.id}
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">{service.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ordning: {service.order}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded',
                  service.active
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100  text-red-600  dark:bg-red-900/30  dark:text-red-400'
                )}
              >
                {service.active ? 'Aktiv' : 'Inaktiv'}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
