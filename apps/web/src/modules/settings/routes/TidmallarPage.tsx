import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { Button, Skeleton } from '@platform/ui';
import { useLessonTypes } from '@modules/scheduling/hooks/useLessonTypes.js';
import { cn } from '@/lib/utils.js';

// ─── Category badge ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  driving:   'B',
  theory:    'Teori',
  risk1:     'B',
  risk2:     'B',
  highway:   'B',
  maneuver:  'B',
};

// ─── TidmallarPage ────────────────────────────────────────────────────────────

export function TidmallarPage() {
  const [tab,        setTab]        = useState<'active' | 'inactive'>('active');
  const [search,     setSearch]     = useState('');

  const { data: lessonTypes = [], isLoading } = useLessonTypes();

  const active   = lessonTypes.filter(lt => lt.is_active);
  const inactive = lessonTypes.filter(lt => !lt.is_active);
  const pool     = tab === 'active' ? active : inactive;

  const filtered = search
    ? pool.filter(lt =>
        lt.name.toLowerCase().includes(search.toLowerCase()) ||
        (lt.code ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : pool;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Breadcrumb + action */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Tidmallar</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" asChild>
            <Link to="/settings/finance/lesson-types">Hantera lektionstyper</Link>
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Detta är en översikt av lektionstyper använda i schemaläggning. Skapa, redigera och
        prissätt lektionstyper under{' '}
        <Link to="/settings/finance/lesson-types" className="text-primary hover:underline">Ekonomi → Lektionstyper</Link>.
      </p>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn active={tab === 'active'}   onClick={() => setTab('active')}>
          Aktiva tidmallar
        </TabBtn>
        <TabBtn active={tab === 'inactive'} onClick={() => setTab('inactive')}>
          Inaktiva tidmallar
        </TabBtn>

        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök på internt eller externt namn"
            className="w-full h-9 pl-8 pr-3 text-sm border border-border rounded-md bg-background
                       text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40
                       placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <Th>Behörighet</Th>
                <Th>Namn</Th>
                <Th>Max deltagare</Th>
                <Th>Varaktighet</Th>
                <Th>Kräver fordon</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                    Inga tidmallar hittades.
                  </td>
                </tr>
              ) : (
                filtered.map(lt => (
                  <tr key={lt.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                    <td className="px-4 py-3">
                      {lt.category && CATEGORY_LABELS[lt.category] ? (
                        <span className="text-xs font-semibold text-primary">
                          {CATEGORY_LABELS[lt.category]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/settings/finance/lesson-types" className="text-primary hover:underline font-medium">
                        {lt.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs text-center">
                      {lt.max_students_per_slot}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {lt.default_duration_minutes} min
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {lt.requires_vehicle ? 'Ja' : 'Nej'}
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/settings/finance/lesson-types" aria-label={`Redigera ${lt.name}`}>
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
