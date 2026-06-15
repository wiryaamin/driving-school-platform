import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
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

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(navigate: (path: string) => void): ColumnDef<MissedExamEntry>[] {
  return [
    {
      id: 'kund',
      header: 'Kund',
      cell: ({ row }) => (
        <span className="text-sm text-primary font-medium cursor-pointer hover:underline">
          {row.original.kund}
        </span>
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
      header: 'Tidslucka',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.tidslucka}</span>
      ),
      size: 140,
      enableSorting: false,
    },
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.datum}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'typ',
      header: 'Typ',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.typ}</span>
      ),
      size: 240,
      enableSorting: false,
    },
    {
      id: 'bokning',
      header: 'Bokning',
      cell: ({ row }) => (
        <button
          onClick={() => navigate(`/scheduling?booking=${row.original.bokning_id}`)}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          Visa bokning
        </button>
      ),
      size: 110,
      enableSorting: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MissadeExaminationsmomentPage() {
  const navigate = useNavigate();
  const [instructorId, setInstructorId] = useState('');
  const [category,     setCategory]     = useState('all');
  const [page,         setPage]         = useState(1);

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
  const columns = useMemo(() => buildColumns(navigate), [navigate]);
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
    </div>
  );
}
