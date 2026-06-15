import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeTemplateGroup {
  id:           string;
  name:         string;
  display_order: number;
}

// ─── TidmallsgrupperPage ──────────────────────────────────────────────────────

export function TidmallsgrupperPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: groups = [], isLoading } = useQuery<TimeTemplateGroup[]>({
    queryKey: ['settings-time-template-groups', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('lesson_type_groups')
        .select('id, name, display_order')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      return (data ?? []) as TimeTemplateGroup[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  return (
    <div className="max-w-xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Tidmallsgrupper</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa tidmallsgrupp
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Tidmallsgrupper</h1>
        <p className="text-sm text-muted-foreground">
          Hantera tidmallsgrupper för bokningsschema och bokningslista.
        </p>
      </div>

      {/* Group list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga tidmallsgrupper har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {groups.map(g => (
            <button
              key={g.id}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">{g.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ordning: {g.display_order}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
