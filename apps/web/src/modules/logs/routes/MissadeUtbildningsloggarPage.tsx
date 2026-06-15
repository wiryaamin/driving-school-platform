import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { useMissedTrainingLogs } from '../hooks/useLogs.js';
import type { MissedTrainingEntry } from '../hooks/useLogs.js';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import { cn } from '@/lib/utils.js';

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(navigate: (path: string) => void): ColumnDef<MissedTrainingEntry>[] {
  return [
    {
      id: 'kund',
      header: 'Kund',
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
      header: 'Tidslucka',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.tidslucka}</span>
      ),
      size: 160,
      enableSorting: false,
    },
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.datum}</span>
      ),
      enableSorting: false,
    },
    {
      id: 'bokning',
      header: 'Bokning',
      cell: ({ row }) => (
        <button
          onClick={() => navigate(`/scheduling?booking=${row.original.bokning_id}`)}
          className="text-xs text-primary hover:underline"
        >
          Visa bokning
        </button>
      ),
      size: 110,
      enableSorting: false,
    },
    {
      id: 'utbildningskort',
      header: 'Utbildningskort',
      cell: () => (
        <span className="text-xs text-muted-foreground/40">—</span>
      ),
      size: 130,
      enableSorting: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MissadeUtbildningsloggarPage() {
  const navigate = useNavigate();
  const [instructorId, setInstructorId] = useState('');

  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const instructors = instructorsData?.data ?? [];

  const { data, isLoading, error, refetch } = useMissedTrainingLogs({
    instructor_id: instructorId || undefined,
    per_page: 50,
  });
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(navigate), [navigate]);

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
              onChange={(e) => setInstructorId(e.target.value)}
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
            <label className="text-xs text-muted-foreground block mb-1">Tidslucka</label>
            <select
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              disabled
            >
              <option>Alla tidsluckor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <p className="text-sm font-semibold text-primary mb-3">Missade utbildningsloggar</p>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-destructive">Det gick inte att hämta loggar.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Försök igen</Button>
        </div>
      ) : records.length === 0 && !isLoading ? (
        <div className="border border-border rounded-lg">
          <div className="grid grid-cols-6 gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
            {['Kund', 'Lärare', 'Tidslucka', 'Datum', 'Bokning', 'Utbildningskort'].map((h) => (
              <span key={h} className="text-xs font-medium text-muted-foreground">{h}</span>
            ))}
          </div>
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Du har inga användare utan utbildningskortloggar
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Du har inga användare utan utbildningskortloggar"
            defaultPageSize={50}
          />
        </div>
      )}

      {data?.meta && records.length > 0 && (
        <p className={cn('text-xs text-muted-foreground mt-2')}>
          Visar 1 till {records.length} av {data.meta.total} resultat
        </p>
      )}
    </div>
  );
}
