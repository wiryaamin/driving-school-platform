import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ArrowUpDown, Search } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleRow {
  id:                    string;
  registration_number:   string;
  make:                  string;
  model:                 string;
  model_year:            number;
  transmission:          'manual' | 'automatic' | 'semi_automatic';
  teaching_categories:   string[];
  fuel_type:             string;
  operational_status:    string;
  next_inspection_due_at: string | null;
  deleted_at:            string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vehicleDisplayName(v: VehicleRow): string {
  return `${v.make} ${v.model} ${v.registration_number}`.trim();
}

function vehicleType(v: VehicleRow): string {
  const cat  = (v.teaching_categories ?? ['B'])[0] ?? 'B';
  const heavy = ['C', 'CE', 'D', 'DE'].includes(cat);
  const kind  = heavy ? 'Tung lastbil' : 'Personbil';
  const trans = v.transmission === 'automatic' ? 'automat'
              : v.transmission === 'manual'    ? 'manuell'
              : 'semi-automat';
  return `${kind} - ${trans} (${cat})`;
}

function isEv(v: VehicleRow): boolean {
  return v.fuel_type === 'electric' || v.fuel_type === 'ev';
}

// ─── ResourcesSettingsPage ────────────────────────────────────────────────────

export function ResourcesSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const [tab,         setTab]         = useState<'active' | 'inactive'>('active');
  const [typeFilter,  setTypeFilter]  = useState('');

  const { data: vehicles = [], isLoading } = useQuery<VehicleRow[]>({
    queryKey: ['settings-resources', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('vehicles')
        .select('id, registration_number, make, model, model_year, transmission, teaching_categories, fuel_type, operational_status, next_inspection_due_at, deleted_at')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('registration_number');
      return (data ?? []) as VehicleRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const inactiveStatuses = new Set(['inactive', 'decommissioned']);
  const activeVehicles   = vehicles.filter(v => !inactiveStatuses.has(v.operational_status));
  const inactiveVehicles = vehicles.filter(v =>  inactiveStatuses.has(v.operational_status));
  const displayed        = tab === 'active' ? activeVehicles : inactiveVehicles;

  const filtered = typeFilter
    ? displayed.filter(v => vehicleType(v).toLowerCase().includes(typeFilter.toLowerCase()))
    : displayed;

  const DATE_FMT = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short' });

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Resurser</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa resurs
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn active={tab === 'active'}   onClick={() => setTab('active')}>
          Aktiva resurser
        </TabBtn>
        <TabBtn active={tab === 'inactive'} onClick={() => setTab('inactive')}>
          Inaktiva resurser
        </TabBtn>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[160px]"
        >
          <option value="">Filtrera efter resurstyp</option>
          <option value="Personbil">Personbil</option>
          <option value="Tung lastbil">Tung lastbil</option>
        </select>

        <Button size="sm" variant="outline" className="flex items-center gap-1">
          <Search className="w-3.5 h-3.5" />
          Sök
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th sortable>Namn</Th>
                <Th>Registreringsnummer</Th>
                <Th>Typ</Th>
                <Th>Beskrivning</Th>
                <Th>Intern anteckning</Th>
                <Th>Platser</Th>
                <Th>Metadata</Th>
                <Th>Nästa besiktning senast</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                    Inga resurser hittades.
                  </td>
                </tr>
              ) : (
                filtered.map(v => (
                  <tr key={v.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                    <td className="px-4 py-3">
                      <button type="button" className="text-primary hover:underline font-medium text-left">
                        {vehicleDisplayName(v)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {v.registration_number}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" className="text-primary hover:underline text-xs">
                        {vehicleType(v)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {isEv(v) ? 'El bil' : `${v.make} ${v.model}`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">–</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">–</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">–</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {v.next_inspection_due_at
                        ? DATE_FMT.format(new Date(v.next_inspection_due_at))
                        : '–'}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 px-4 text-sm font-medium rounded-md transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      {children}
    </button>
  );
}

function Th({ children, sortable }: { children?: React.ReactNode; sortable?: boolean }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground whitespace-nowrap">
      {sortable ? (
        <button type="button" className="flex items-center gap-1 hover:text-primary">
          {children}
          <ArrowUpDown className="w-3 h-3 opacity-50" />
        </button>
      ) : children}
    </th>
  );
}
