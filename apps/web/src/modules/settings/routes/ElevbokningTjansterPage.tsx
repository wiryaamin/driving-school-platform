import { Link } from 'react-router-dom';
import { Key, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

interface BookingService {
  id:         string;
  name:       string;
  sort_order: number;
  is_active:  boolean;
  category:   string | null;
}

export function ElevbokningTjansterPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const { data: services = [], isLoading } = useQuery<BookingService[]>({
    queryKey: ['settings-booking-services', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('lesson_types')
        .select('id, name, sort_order, is_active, category')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      return (data ?? []) as BookingService[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const active   = services.filter(s => s.is_active);
  const inactive = services.filter(s => !s.is_active);

  return (
    <div className="max-w-2xl space-y-4">
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

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Key className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Elevbokning</h1>
        <p className="text-sm text-muted-foreground">Konfigurera elevernas möjlighet att boka in körlektioner och kurser.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Inga lektionstyper hittades. Skapa lektionstyper under Inställningar → Tidmallar.
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Aktiva tjänster</p>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {active.map(s => (
                  <ServiceRow key={s.id} service={s} />
                ))}
              </div>
            </div>
          )}
          {inactive.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Inaktiva tjänster</p>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden opacity-70">
                {inactive.map(s => (
                  <ServiceRow key={s.id} service={s} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ServiceRow({ service }: { service: BookingService }) {
  return (
    <button type="button" className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary">{service.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {service.category ? `Kategori: ${service.category} · ` : ''}Ordning: {service.sort_order}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded',
          service.is_active
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100  text-red-600  dark:bg-red-900/30  dark:text-red-400',
        )}>
          {service.is_active ? 'Aktiv' : 'Inaktiv'}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
      </div>
    </button>
  );
}
