import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Gift } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── PresentkortSettingsPage ──────────────────────────────────────────────────

export function PresentkortSettingsPage() {
  const [months, setMonths] = useState(24);

  function handleSave() { /* wire to org settings mutation */ }

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + feedback */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Presentkort</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
          <Gift className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Presentkort</h1>
        <p className="text-sm text-muted-foreground">Hantera inställningar för presentkort.</p>
      </div>

      {/* Giltighetstid */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Giltighetstid</h2>
          <p className="text-xs text-primary mt-0.5">
            Ange hur lång giltighetstid ni önskar att presentkort ska ha när de genereras.
            Siffran ska anges i månader.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Antal månader</label>
          <input
            type="number"
            min={1}
            max={120}
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} className="bg-green-500 hover:bg-green-600 text-white">
            Spara inställningar
          </Button>
        </div>
      </div>
    </div>
  );
}
