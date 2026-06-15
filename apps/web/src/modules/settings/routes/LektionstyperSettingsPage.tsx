import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, BookOpen } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LessonTypeSetting {
  id:            string;
  name:          string;
  category:      string;
  is_active:     boolean;
  display_order: number;
  color_hex:     string;
}

// ─── LektionstyperSettingsPage ────────────────────────────────────────────────

export function LektionstyperSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: types = [], isLoading } = useQuery<LessonTypeSetting[]>({
    queryKey: ['settings-lesson-types', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('lesson_types')
        .select('id, name, category, is_active, display_order, color_hex')
        .eq('organization_id', orgId)
        .order('display_order', { ascending: true });
      return (data ?? []) as LessonTypeSetting[];
    },
    enabled:   !!orgId,
    staleTime: 30_000,
  });

  const active   = types.filter(t => t.is_active);
  const inactive = types.filter(t => !t.is_active);

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/finance/accounts" className="hover:text-foreground">Ekonomi</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Lektionstyper</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
            Skapa lektionstyp
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center">
          <BookOpen className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Lektionstyper</h1>
        <p className="text-sm text-muted-foreground">
          Hantera lektionstyper för körlektioner. Varje lektionstyp kan använda olika styp- och tidsmallar.
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga lektionstyper hittades.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {[...active, ...inactive].map(t => (
            <button
              key={t.id}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
            >
              {/* Color swatch */}
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: t.color_hex }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.category} · Ordning: {t.display_order}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  t.is_active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {t.is_active ? 'Aktiv' : 'Inaktiv'}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
