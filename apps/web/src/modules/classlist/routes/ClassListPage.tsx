import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, GraduationCap, TrendingUp } from 'lucide-react';
import type { ColumnDef } from '@platform/ui';
import {
  Button, DataTable,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@platform/ui';
import { useClassList, useLicenceCategories } from '../hooks/useClassList.js';
import type { ClassListEntry } from '../hooks/useClassList.js';
import { cn } from '@/lib/utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(minutes: number): string {
  if (minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function CheckCell({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
  ) : (
    <Minus className="w-3.5 h-3.5 text-muted-foreground/30" />
  );
}

function PraktiskaCell({ risk1, risk2 }: { risk1: boolean; risk2: boolean }) {
  const done = [risk1, risk2].filter(Boolean).length;
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded font-medium',
          risk1
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-muted text-muted-foreground/50',
        )}
      >
        Risk 1
      </span>
      <span
        className={cn(
          'text-xs px-1.5 py-0.5 rounded font-medium',
          risk2
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-muted text-muted-foreground/50',
        )}
      >
        Risk 2
      </span>
      <span className="text-xs text-muted-foreground ml-0.5">{done}/2</span>
    </div>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(navigate: (p: string) => void): ColumnDef<ClassListEntry>[] {
  return [
    {
      id: 'name',
      header: 'Förnamn / Efternamn',
      cell: ({ row }) => (
        <button
          onClick={() => navigate(`/students/${row.original.id}`)}
          className="text-left"
        >
          <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
            {row.original.first_name}
          </span>
          <span className="text-sm text-foreground ml-1">{row.original.last_name}</span>
        </button>
      ),
    },
    {
      id: 'leg',
      header: 'Leg',
      cell: ({ row }) => (
        <span className="text-sm font-mono text-foreground font-medium">
          {row.original.leg}
        </span>
      ),
      size: 60,
      enableSorting: false,
    },
    {
      id: 'kkt',
      header: 'KKT',
      cell: ({ row }) => <CheckCell ok={row.original.kkt} />,
      size: 60,
      enableSorting: false,
    },
    {
      id: 'kapitel',
      header: 'Kapitel',
      cell: () => <span className="text-sm text-muted-foreground/40">—</span>,
      size: 80,
      enableSorting: false,
    },
    {
      id: 'fragor',
      header: 'Frågor',
      cell: () => <span className="text-sm text-muted-foreground/40">—</span>,
      size: 80,
      enableSorting: false,
    },
    {
      id: 'ovningsprov',
      header: 'Övningsprov',
      cell: () => <span className="text-sm text-muted-foreground/40">—</span>,
      size: 110,
      enableSorting: false,
    },
    {
      id: 'slutprov',
      header: 'Slutprov',
      cell: ({ row }) => <CheckCell ok={row.original.slutprov} />,
      size: 90,
      enableSorting: false,
    },
    {
      id: 'praktiska',
      header: 'Praktiska delmoment',
      cell: ({ row }) => (
        <PraktiskaCell risk1={row.original.risk1_done} risk2={row.original.risk2_done} />
      ),
      size: 200,
      enableSorting: false,
    },
    {
      id: 'utbildad_tid',
      header: 'Utbildad tid',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTime(row.original.utbildad_tid_min)}
        </span>
      ),
      size: 110,
      enableSorting: false,
    },
    {
      id: 'bokningar',
      header: 'Bokningar',
      cell: ({ row }) => (
        <span className="text-sm text-foreground font-medium">
          {row.original.bokningar > 0 ? row.original.bokningar : '—'}
        </span>
      ),
      size: 90,
      enableSorting: false,
    },
  ];
}

// ─── Group progress summary (Gap 9) ──────────────────────────────────────────

function GroupProgressSummary({ entries }: { entries: ClassListEntry[] }) {
  if (entries.length === 0) return null;

  const n = entries.length;
  const kktDone    = entries.filter(e => e.kkt).length;
  const slutDone   = entries.filter(e => e.slutprov).length;
  const risk1Done  = entries.filter(e => e.risk1_done).length;
  const risk2Done  = entries.filter(e => e.risk2_done).length;

  function StatBar({ label, done, total }: { label: string; done: number; total: number }) {
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    return (
      <div className="space-y-1 min-w-0">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground truncate">{label}</span>
          <span className="font-semibold text-foreground ml-2 shrink-0">{done}/{total}</span>
        </div>
        <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Grupframsteg — {n} elever</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatBar label="KKT"       done={kktDone}   total={n} />
        <StatBar label="Slutprov"  done={slutDone}   total={n} />
        <StatBar label="Risk 1"    done={risk1Done}  total={n} />
        <StatBar label="Risk 2"    done={risk2Done}  total={n} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ClassListPage() {
  const navigate = useNavigate();

  const [pendingCategory, setPendingCategory] = useState('all');
  const [activeCategory,  setActiveCategory]  = useState('all');
  const [page, setPage] = useState(1);

  const { data: categories = [] } = useLicenceCategories();

  const { data, isLoading, error, refetch } = useClassList({
    licence_category: activeCategory !== 'all' ? activeCategory : undefined,
    page,
    per_page: 50,
  });

  const records    = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const columns    = useMemo(() => buildColumns(navigate), [navigate]);

  function handleFilter() {
    setActiveCategory(pendingCategory);
    setPage(1);
  }

  return (
    <div className="max-w-screen-2xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between pb-3">
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Hem</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">Klasser</span>
        </nav>
        <button className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        {/* Alla klasser */}
        <Select value="alla" onValueChange={() => undefined}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alla">Alla klasser</SelectItem>
          </SelectContent>
        </Select>

        {/* Utbildningstyp */}
        <Select value={pendingCategory} onValueChange={(v) => setPendingCategory(v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla utbildningstyper</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleFilter} className="bg-primary text-primary-foreground hover:bg-primary/90">
          Filtrera
        </Button>
      </div>

      {/* Group progress */}
      {!isLoading && records.length > 0 && (
        <GroupProgressSummary entries={records} />
      )}

      {/* Table */}
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <GraduationCap className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-sm text-destructive">Det gick inte att hämta klasslistan.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={records}
              isLoading={isLoading}
              emptyMessage="Inga elever hittades."
              defaultPageSize={50}
              enablePagination={false}
            />
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                Visar {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} av {total} elever
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cn(
                    'w-7 h-7 rounded border border-border flex items-center justify-center text-xs transition-colors',
                    page === 1 ? 'opacity-40 cursor-default' : 'hover:bg-accent',
                  )}
                >‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-7 h-7 rounded border text-xs transition-colors',
                        p === page
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-accent',
                      )}
                    >{p}</button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={cn(
                    'w-7 h-7 rounded border border-border flex items-center justify-center text-xs transition-colors',
                    page >= totalPages ? 'opacity-40 cursor-default' : 'hover:bg-accent',
                  )}
                >›</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
