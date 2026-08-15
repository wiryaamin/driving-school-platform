import { useState, useMemo } from 'react';
import type { ColumnDef } from '@platform/ui';
import { Button, DataTable } from '@platform/ui';
import { formatDateShort, formatTime } from '@platform/utils';
import { useMissedTrainingLogs } from '../hooks/useLogs.js';
import type { MissedTrainingEntry } from '../hooks/useLogs.js';
import { useInstructorList } from '@modules/instructors/hooks/useInstructors.js';
import { useLessonTypes } from '@modules/scheduling/hooks/useLessonTypes.js';
import { cn } from '@/lib/utils.js';

// Always Europe/Stockholm, regardless of the viewer's device timezone — same
// shared formatter already used across the rest of Loggar (see commit
// 46ad024). datum is now the raw scheduled lesson start time (starts_at) —
// previously this column rendered a full descriptive sentence instead of a
// real timestamp, so it never went through this shared formatter at all.
function DatumCell({ iso }: { iso: string }) {
  return (
    <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
      {formatDateShort(iso)} <span className="text-muted-foreground/60">|</span> {formatTime(iso)}
    </span>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(): ColumnDef<MissedTrainingEntry>[] {
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
      size: 160,
      enableSorting: false,
    },
    {
      id: 'datum',
      header: 'Datum',
      cell: ({ row }) => <DatumCell iso={row.original.datum} />,
      size: 150,
      enableSorting: false,
    },
  ];
}

// ─── Detail card ──────────────────────────────────────────────────────────────
// Same below-table "click a row, see detail underneath" pattern already
// established for Ändringslogg/Aktivitetslogg/Bokningsloggar/
// Kommunikationsloggar — replaces the previous "Visa bokning" button, which
// navigated to /scheduling?booking=<id>, a query param nothing in the app
// actually reads (confirmed by search while building the equivalent
// Bokningsloggar detail interaction).

function MissedTrainingDetail({ entry }: { entry: MissedTrainingEntry }) {
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

export function MissadeUtbildningsloggarPage() {
  const [instructorId, setInstructorId] = useState('');
  const [lessonTypeId, setLessonTypeId] = useState('');
  const [selected, setSelected]         = useState<MissedTrainingEntry | null>(null);

  const { data: instructorsData } = useInstructorList({ per_page: 100 });
  const instructors = instructorsData?.data ?? [];

  const { data: lessonTypes } = useLessonTypes();

  const { data, isLoading, error, refetch } = useMissedTrainingLogs({
    instructor_id:  instructorId || undefined,
    lesson_type_id: lessonTypeId || undefined,
    per_page: 50,
  });
  const records = data?.data ?? [];
  const columns = useMemo(() => buildColumns(), []);

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
            <label className="text-xs text-muted-foreground block mb-1">Lektionstyp</label>
            <select
              value={lessonTypeId}
              onChange={(e) => setLessonTypeId(e.target.value)}
              className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Alla lektionstyper</option>
              {(lessonTypes ?? []).map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
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
          <div className="grid grid-cols-4 gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
            {['Elev', 'Lärare', 'Lektionstyp', 'Datum'].map((h) => (
              <span key={h} className="text-xs font-medium text-muted-foreground">{h}</span>
            ))}
          </div>
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Inga missade utbildningar hittades
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={records}
            isLoading={isLoading}
            emptyMessage="Inga missade utbildningar hittades."
            defaultPageSize={50}
            onRowClick={(row) => setSelected(row.id === selected?.id ? null : row)}
          />
        </div>
      )}

      {data?.meta && records.length > 0 && (
        <p className={cn('text-xs text-muted-foreground mt-2')}>
          Visar 1 till {records.length} av {data.meta.total} resultat
        </p>
      )}

      {selected && <MissedTrainingDetail entry={selected} />}
    </div>
  );
}
