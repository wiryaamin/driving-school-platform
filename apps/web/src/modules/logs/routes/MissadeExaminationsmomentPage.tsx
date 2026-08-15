import { useState, useMemo } from 'react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { formatDateShort, formatTime } from '@platform/utils';
import { useMissedExamLogs } from '../hooks/useLogs.js';
import type { MissedExamEntry } from '../hooks/useLogs.js';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import { cn } from '@/lib/utils.js';

// ─── Exam type options ────────────────────────────────────────────────────────

const EXAM_CATEGORIES = [
  { value: 'all',        label: 'Alla examinationsmoment' },
  { value: 'risk1',      label: 'Riskutbildning 1 (Risk 1)' },
  { value: 'risk2',      label: 'Riskutbildning 2 (Risk 2)' },
  { value: 'assessment', label: 'Bedömning' },
];

// Always Europe/Stockholm, regardless of the viewer's device timezone — same
// shared formatter already used across the rest of Loggar (see commit
// 46ad024). datum is now the raw scheduled exam start time (starts_at) —
// previously this column rendered a full descriptive sentence instead of a
// real timestamp.
function DatumCell({ iso }: { iso: string }) {
  return (
    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
      {formatDateShort(iso)} <span className="text-muted-foreground/60">|</span> {formatTime(iso)}
    </span>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<MissedExamEntry>[] {
  return [
    {
      id: 'kund',
      header: 'Elev',
      cell: ({ row }) => (
        <span className="text-sm text-primary font-medium">{row.original.kund}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'larare',
      header: 'Lärare',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.larare}</span>
      ),
      size: 180,
      enableSorting: false,
    },
    {
      id: 'tidslucka',
      header: 'Lektionstyp',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.tidslucka}</span>
      ),
      size: 200,
      enableSorting: false,
    },
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => <DatumCell iso={row.original.datum} />,
      size: 150,
      enableSorting: false,
    },
    {
      id: 'typ',
      header: 'Examinationstyp',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.typ}</span>
      ),
      size: 180,
      enableSorting: false,
    },
  ];
}

// ─── Detail card ──────────────────────────────────────────────────────────────
// Same below-table "click a row, see detail underneath" pattern already
// established for Ändringslogg/Aktivitetslogg/Bokningsloggar/
// Kommunikationsloggar/Missade utbildningsloggar — replaces the previous
// "Visa bokning" button (dead: /scheduling?booking=<id> is read by nothing
// in the app) and the dead cursor-pointer/hover:underline "Kund" cell that
// never had a click handler.

function MissedExamDetail({ entry }: { entry: MissedExamEntry }) {
  return (
    <div className="mt-4 bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-primary">{entry.tillfalle}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground mb-0.5">Elev</p>
          <p className="text-foreground">{entry.kund}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Lärare</p>
          <p className="text-foreground">{entry.larare}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Lektionstyp</p>
          <p className="text-foreground">{entry.tidslucka}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Examinationstyp</p>
          <p className="text-foreground">{entry.typ}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Status</p>
          <p className="text-foreground">Uteblev</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Schemalagd tid</p>
          <p className="text-foreground font-mono">
            {formatDateShort(entry.datum)} {formatTime(entry.datum)}
          </p>
        </div>
        {entry.no_show_marked_at && (
          <div>
            <p className="text-muted-foreground mb-0.5">Registrerad som utebliven</p>
            <p className="text-foreground font-mono">
              {formatDateShort(entry.no_show_marked_at)} {formatTime(entry.no_show_marked_at)}
            </p>
          </div>
        )}
        <div>
          <p className="text-muted-foreground mb-0.5">Fordon</p>
          <p className="text-foreground">{entry.fordon ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Plats</p>
          <p className="text-foreground">{entry.plats ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5">Boknings-ID</p>
          <p className="text-foreground font-mono">{entry.bokning_id.slice(0, 8)}…</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MissadeExaminationsmomentPage() {
  const [instructorId, setInstructorId] = useState('');
  const [category,     setCategory]     = useState('all');
  const [page,         setPage]         = useState(1);
  const [selected,     setSelected]     = useState<MissedExamEntry | null>(null);

  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const instructors = instructorsData?.data ?? [];

  const { data, isLoading, error, refetch } = useMissedExamLogs({
    instructor_id: instructorId || undefined,
    category:      category !== 'all' ? category : undefined,
    page,
    per_page: 25,
  });

  const records = data?.data ?? [];
  const meta    = data?.meta;
  const columns = useMemo(() => buildColumns(), []);
  const totalPages = meta ? Math.ceil(meta.total / (meta.per_page ?? 25)) : 1;

  return (
    <div>
      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 mb-5">
        <p className="text-sm font-semibold text-primary mb-3">Filtrera</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Lärare</label>
            <select
              value={instructorId}
              onChange={(e) => { setInstructorId(e.target.value); setPage(1); }}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Alla lärare</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.first_name} {i.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Typ av examinationsmoment</label>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {EXAM_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <p className="text-sm font-semibold text-primary mb-3">Missade examinationsmoment</p>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta loggar.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga examinationsmoment hittades."
            defaultPageSize={25}
            enablePagination={false}
            onRowClick={(row) => setSelected(row.id === selected?.id ? null : row)}
          />
        </div>
      )}

      {/* Custom pagination */}
      {meta && meta.total > 0 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted-foreground">
            Visar {(page - 1) * 25 + 1} till {Math.min(page * 25, meta.total)} av {meta.total} resultat
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                'w-7 h-7 rounded border border-border flex items-center justify-center text-xs transition-colors',
                page === 1 ? 'opacity-40 cursor-default' : 'hover:bg-accent',
              )}
            >
              ‹
            </button>
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
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className={cn(
                'w-7 h-7 rounded border border-border flex items-center justify-center text-xs transition-colors',
                page >= totalPages ? 'opacity-40 cursor-default' : 'hover:bg-accent',
              )}
            >
              ›
            </button>
          </div>
        </div>
      )}

      {selected && <MissedExamDetail entry={selected} />}
    </div>
  );
}
