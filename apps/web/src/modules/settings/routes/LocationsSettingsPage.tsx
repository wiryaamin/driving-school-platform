import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationRow {
  id:            string;
  name:          string;
  address_line1: string;
  postal_code:   string;
  city:          string;
  is_primary:    boolean;
  status:        string;
  deleted_at:    string | null;
}

// ─── LocationsSettingsPage ────────────────────────────────────────────────────

export function LocationsSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: locations = [], isLoading } = useQuery<LocationRow[]>({
    queryKey: ['settings-locations', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('organization_locations')
        .select('id, name, address_line1, postal_code, city, is_primary, status, deleted_at')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name');
      return (data ?? []) as LocationRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const active   = locations.filter(l => l.status === 'active');
  const inactive = locations.filter(l => l.status !== 'active');

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Platser</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa plats
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
          <MapPin className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Platser</h1>
        <p className="text-sm text-muted-foreground">Hantera verksamhetens platser och adresser.</p>
      </div>

      {/* Location list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {active.length === 0 && inactive.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Inga platser har skapats ännu.
            </div>
          ) : (
            [...active, ...inactive].map(loc => (
              <LocationRow key={loc.id} location={loc} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── LocationRow ──────────────────────────────────────────────────────────────

function LocationRow({ location }: { location: LocationRow }) {
  const isActive = location.status === 'active';
  const address  = `${location.address_line1}, ${location.postal_code} ${location.city}`;

  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary">{location.name}</p>
        <p className="text-xs text-primary/60 mt-0.5">{address}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-border text-muted-foreground">
          Elevbokning
        </span>
        <span
          className={cn(
            'text-[10px] font-semibold px-2 py-0.5 rounded',
            isActive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100  text-red-600  dark:bg-red-900/30  dark:text-red-400'
          )}
        >
          {isActive ? 'Aktiv' : 'Inaktiv'}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
      </div>
    </button>
  );
}
