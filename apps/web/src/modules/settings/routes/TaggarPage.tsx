import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Tag, ChevronRight } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerTag {
  id:            string;
  name:          string;
  display_order: number;
  student_count: number;
}

// ─── TaggarPage ───────────────────────────────────────────────────────────────

export function TaggarPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: tags = [], isLoading } = useQuery<CustomerTag[]>({
    queryKey: ['settings-customer-tags', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('student_tags')
        .select('id, name, display_order')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('display_order', { ascending: true });
      return ((data ?? []) as Array<{ id: string; name: string; display_order: number }>).map(t => ({
        ...t,
        student_count: 0,
      }));
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
          <Link to="/settings/customers/config" className="hover:text-foreground">Kunder</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Taggar</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa ny tagg
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
          <Tag className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Taggar</h1>
        <p className="text-sm text-muted-foreground">Hantera taggar för kunder.</p>
      </div>

      {/* Tag list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : tags.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga taggar har skapats ännu.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full bg-muted border border-border shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{tag.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tag.student_count} kunder · Ordning: {tag.display_order}
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
