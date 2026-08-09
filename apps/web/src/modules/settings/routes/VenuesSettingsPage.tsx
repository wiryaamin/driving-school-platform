import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────
//
// Lokaler/Banor and Platser (LocationsSettingsPage) both read the same
// organization_locations table — there is no separate venues/tracks entity
// in the schema. Platser already owns full CRUD (address, hours, contact,
// primary flag); this page is a read-only pointer into that same data,
// not a second management surface (Canonical Settings Rule).

interface VenueRow {
  id:         string;
  name:       string;
  status:     string;
  deleted_at: string | null;
}

// ─── VenuesSettingsPage ───────────────────────────────────────────────────────

export function VenuesSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const [tab, setTab] = useState<'active' | 'inactive'>('active');

  const { data: venues = [], isLoading } = useQuery<VenueRow[]>({
    queryKey: ['settings-venues', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('organization_locations')
        .select('id, name, status, deleted_at')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('name');
      return (data ?? []) as VenueRow[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const active   = venues.filter(v => v.status === 'active');
  const inactive = venues.filter(v => v.status !== 'active');
  const displayed = tab === 'active' ? active : inactive;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/resources" className="hover:text-foreground">Resurser</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Lokaler/Banor</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" asChild>
            <Link to="/settings/locations">Hantera platser</Link>
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Lokaler och banor hanteras tillsammans med skolans övriga platser under{' '}
        <Link to="/settings/locations" className="text-primary hover:underline">Inställningar → Platser</Link>.
      </p>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <TabBtn active={tab === 'active'}   onClick={() => setTab('active')}>
          Aktiva lokaler/banor
        </TabBtn>
        <TabBtn active={tab === 'inactive'} onClick={() => setTab('inactive')}>
          Inaktiva lokaler/banor
        </TabBtn>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th>Namn</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-muted-foreground text-sm">
                    Inga lokaler/banor hittades.
                  </td>
                </tr>
              ) : (
                displayed.map(venue => (
                  <tr key={venue.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                    <td className="px-4 py-3">
                      <Link to="/settings/locations" className="text-primary hover:underline font-medium">
                        {venue.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {venue.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/settings/locations" aria-label={`Visa ${venue.name} under Platser`}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                      </Link>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-foreground whitespace-nowrap">
      {children}
    </th>
  );
}
