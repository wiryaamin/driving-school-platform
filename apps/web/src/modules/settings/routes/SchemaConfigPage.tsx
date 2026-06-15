import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ChevronRight } from 'lucide-react';
import { Button } from '@platform/ui';

// ─── Time options ─────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return `${h}:00:00`;
});

// ─── SchemaConfigPage ─────────────────────────────────────────────────────────

export function SchemaConfigPage() {
  const [startTime,          setStartTime]          = useState('08:00:00');
  const [endTime,            setEndTime]            = useState('18:00:00');
  const [showWeekends,       setShowWeekends]       = useState(true);
  const [openSlotOnCreate,   setOpenSlotOnCreate]   = useState(false);

  function handleSave() { /* would call Supabase to save org.settings.schema */ }

  return (
    <div className="max-w-xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">Schemainställningar</span>
      </nav>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Settings className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Schemainställningar</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurera verksamhetens schema- och bokningsinställningar.
        </p>
      </div>

      {/* Verksamhetens tider */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Verksamhetens tider</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Starttid schema</label>
            <select
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background
                         text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Sluttid schema</label>
            <select
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background
                         text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showWeekends}
            onChange={e => setShowWeekends(e.target.checked)}
            className="mt-0.5 rounded border-border accent-primary w-4 h-4 shrink-0"
          />
          <div>
            <span className="text-sm text-foreground">Visa helger som standard i bokningsschemat</span>
            <p className="text-xs text-primary/70 mt-0.5">
              Markera denna ruta ifall du önskar att helger ska visas i bokningsschemat som standard.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={openSlotOnCreate}
            onChange={e => setOpenSlotOnCreate(e.target.checked)}
            className="mt-0.5 rounded border-border accent-primary w-4 h-4 shrink-0"
          />
          <div>
            <span className="text-sm text-foreground">Öppna tidsluckan direkt efter skapande</span>
            <p className="text-xs text-primary/70 mt-0.5">
              Markera denna ruta ifall du önskar att redigeringsmodalen för tidsluckan ska öppnas direkt efter att en ny tidslucka skapats i bokningsschemat.
            </p>
          </div>
        </label>

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={handleSave}>
            Spara
          </Button>
        </div>
      </div>
    </div>
  );
}
