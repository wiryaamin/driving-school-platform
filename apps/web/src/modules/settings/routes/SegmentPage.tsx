import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerSegment {
  id:            string;
  name:          string;
  match_mode:    string;
  display_order: number;
}

// ─── SegmentPage ──────────────────────────────────────────────────────────────

export function SegmentPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: segments = [], isLoading } = useQuery<CustomerSegment[]>({
    queryKey: ['settings-customer-segments', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('customer_segments')
        .select('id, name, match_mode, display_order')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      return (data ?? []) as CustomerSegment[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  function matchLabel(mode: string) {
    return mode === 'or' ? 'Eller' : 'Och';
  }

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/customers/config" className="hover:text-foreground">Kunder</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Segment</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa nytt segment
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
          <LayoutGrid className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Segment</h1>
        <p className="text-sm text-muted-foreground">Skapa och hantera segment för att gruppera kunder.</p>
      </div>

      {/* Segment list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : segments.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga segment har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {segments.map(seg => (
            <button
              key={seg.id}
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{seg.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {matchLabel(seg.match_mode)} (Alla regler måste vara uppfyllda) · Ordning: {seg.display_order}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
